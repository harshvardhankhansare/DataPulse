import { TableSchema } from '../schema/schemaTypes.js';
import {
  PiiCategory,
  PiiConfidence,
  PiiDetection,
  PrivacyAuditReport,
  RiskLevel,
  MaskingStrategy,
} from './privacyTypes.js';
import { maskValueInJs } from './piiMasker.js';

type QueryFunction = (sql: string) => Promise<any[]>;

interface ColumnHeuristic {
  category: PiiCategory;
  headerRegex: RegExp;
  valueRegex: RegExp;
  recommendedStrategy: MaskingStrategy;
}

const HEURISTICS: ColumnHeuristic[] = [
  {
    category: 'email',
    headerRegex: /email|e_mail|mail_address|user_email|contact_email/i,
    valueRegex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    recommendedStrategy: 'partial',
  },
  {
    category: 'phone',
    headerRegex: /phone|mobile|telephone|cell_phone|fax|contact_no|tel/i,
    valueRegex: /^(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}$/,
    recommendedStrategy: 'partial',
  },
  {
    category: 'credit_card',
    headerRegex: /credit_card|card_num|card_number|cc_num|pan|card_no|cvv|iban/i,
    valueRegex: /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})$/,
    recommendedStrategy: 'partial',
  },
  {
    category: 'ssn',
    headerRegex: /ssn|social_security|national_id|tax_id|sin|govt_id/i,
    valueRegex: /^\d{3}-\d{2}-\d{4}$|^\d{9}$/,
    recommendedStrategy: 'partial',
  },
  {
    category: 'ip_address',
    headerRegex: /ip|ip_address|client_ip|host_ip|ipv4|ipv6/i,
    valueRegex: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    recommendedStrategy: 'partial',
  },
  {
    category: 'financial',
    headerRegex: /salary|wage|compensation|bonus|net_worth|balance|account_balance/i,
    valueRegex: /^\$?\s*\d+(\.\d{1,2})?$/,
    recommendedStrategy: 'partial',
  },
  {
    category: 'name',
    headerRegex: /first_name|last_name|full_name|customer_name|patient_name|employee_name|client_name/i,
    valueRegex: /^[A-Z][a-z]{1,20}(\s[A-Z][a-z]{1,20})+$/,
    recommendedStrategy: 'partial',
  },
  {
    category: 'address',
    headerRegex: /street|street_address|home_address|address_line|postal_code|zip_code|zipcode/i,
    valueRegex: /^\d+\s+[A-Za-z0-9\s,.]+$/,
    recommendedStrategy: 'redact',
  },
];

export async function detectPii(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction
): Promise<PrivacyAuditReport> {
  const detections: PiiDetection[] = [];

  for (const col of schema.columns) {
    const colName = col.name;
    const escCol = `"${colName.replace(/"/g, '""')}"`;
    const escTable = `"${tableName.replace(/"/g, '""')}"`;

    let matchedHeuristic: ColumnHeuristic | null = null;
    let headerMatched = false;

    // 1. Check header keyword match
    for (const h of HEURISTICS) {
      if (h.headerRegex.test(colName)) {
        matchedHeuristic = h;
        headerMatched = true;
        break;
      }
    }

    // 2. Sample values from DuckDB
    let sampleValues: string[];
    try {
      const rows = await queryFn(`SELECT ${escCol} AS val FROM ${escTable} WHERE ${escCol} IS NOT NULL LIMIT 40`);
      sampleValues = rows
        .map(r => (r.val !== null && r.val !== undefined ? String(r.val).trim() : ''))
        .filter(v => v.length > 0);
    } catch (e) {
      console.warn(`[PII Detector] Failed to sample column ${colName}:`, e);
      continue;
    }

    if (sampleValues.length === 0) continue;

    // 3. If header didn't match, test values against regexes
    if (!matchedHeuristic) {
      for (const h of HEURISTICS) {
        // Skip name/address/financial regex checking without header cue to avoid false positives
        if (h.category === 'name' || h.category === 'address' || h.category === 'financial') continue;

        let matchCount = 0;
        for (const val of sampleValues) {
          const cleanVal = h.category === 'credit_card' ? val.replace(/[\s-]/g, '') : val;
          if (h.valueRegex.test(cleanVal)) {
            matchCount++;
          }
        }
        if (matchCount / sampleValues.length >= 0.25) {
          matchedHeuristic = h;
          break;
        }
      }
    }

    if (matchedHeuristic) {
      // Calculate match count & confidence
      let valueMatchCount = 0;
      for (const val of sampleValues) {
        const cleanVal = matchedHeuristic.category === 'credit_card' ? val.replace(/[\s-]/g, '') : val;
        if (matchedHeuristic.valueRegex.test(cleanVal)) {
          valueMatchCount++;
        }
      }

      let confidence: PiiConfidence;
      if (headerMatched && valueMatchCount > 0) {
        confidence = 'high';
      } else if (headerMatched || valueMatchCount / sampleValues.length >= 0.4) {
        confidence = 'high';
      } else {
        confidence = 'medium';
      }

      const sampleOriginal = sampleValues[0] || '';
      const sampleMasked = maskValueInJs(
        sampleOriginal,
        matchedHeuristic.category,
        matchedHeuristic.recommendedStrategy
      );

      detections.push({
        column: colName,
        category: matchedHeuristic.category,
        confidence,
        matchCount: valueMatchCount > 0 ? valueMatchCount : sampleValues.length,
        sampleOriginal,
        sampleMasked,
        recommendedStrategy: matchedHeuristic.recommendedStrategy,
      });
    }
  }

  // Calculate Risk Level
  let riskLevel: RiskLevel = 'SAFE';
  const highConfCount = detections.filter(d => d.confidence === 'high').length;
  const criticalTypes = ['credit_card', 'ssn', 'financial'];
  const hasCritical = detections.some(d => criticalTypes.includes(d.category));

  if (hasCritical) {
    riskLevel = 'CRITICAL';
  } else if (highConfCount >= 3) {
    riskLevel = 'HIGH';
  } else if (detections.length >= 2) {
    riskLevel = 'MODERATE';
  } else if (detections.length === 1) {
    riskLevel = 'LOW';
  }

  // Compliance Flags
  const hasEmailOrName = detections.some(d => d.category === 'email' || d.category === 'name');
  const hasPayment = detections.some(d => d.category === 'credit_card' || d.category === 'financial');
  const hasGovt = detections.some(d => d.category === 'ssn');

  return {
    tableName,
    totalColumns: schema.columns.length,
    piiColumnsCount: detections.length,
    detections,
    riskLevel,
    complianceFlags: {
      gdprImpact: hasEmailOrName || hasGovt,
      hipaaImpact: hasGovt || detections.some(d => d.category === 'name'),
      pciDssImpact: hasPayment,
      soc2Impact: detections.length > 0,
    },
    isMasked: false,
    scannedAt: new Date().toISOString(),
  };
}
