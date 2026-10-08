import path from 'path';
import { importFile } from '../ingestion/importFile.js';
import { detectSchema } from '../schema/typeDetector.js';
import { profileQuality } from '../profiler/qualityScore.js';
import { selectApplicableAnalyses } from '../rules/ruleEngine.js';
import {
  LakehouseTable,
  JoinPlan,
  MultiImportResult,
  JoinViewResult,
} from './lakehouseTypes.js';
import { detectJoinCandidates } from './relationalMatcher.js';

type QueryFunction = (sql: string) => Promise<any[]>;

/**
 * Ingests multiple files into distinct in-memory DuckDB tables and detects relationships.
 */
export async function importMultipleFiles(
  filePaths: string[],
  queryFn: QueryFunction
): Promise<MultiImportResult> {
  const tables: LakehouseTable[] = [];
  const usedNames = new Set<string>();

  for (const filePath of filePaths) {
    const ext = path.extname(filePath);
    let baseName = path
      .basename(filePath, ext)
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase();

    if (!baseName || !/^[a-z_]/.test(baseName)) {
      baseName = `tbl_${baseName}`;
    }

    let tableName = baseName;
    let counter = 2;
    while (usedNames.has(tableName)) {
      tableName = `${baseName}_${counter++}`;
    }
    usedNames.add(tableName);

    // Ingest into DuckDB
    const { format } = await importFile(filePath, tableName, queryFn);

    // Retrieve column and count metadata
    const schema = await detectSchema(tableName, queryFn);
    const countRows = await queryFn(`SELECT count(*) as c FROM "${tableName.replace(/"/g, '""')}"`);
    const rowCount = Number(countRows[0]?.c || 0);

    tables.push({
      tableName,
      fileName: path.basename(filePath),
      format,
      rowCount,
      columns: schema.columns.map(c => ({
        name: c.name,
        type: c.detectedType,
      })),
    });
  }

  // Detect relational join candidates
  const joinCandidates = await detectJoinCandidates(tables, queryFn);

  return {
    tables,
    joinCandidates,
  };
}

/**
 * Executes a join plan, creates a unified in-memory view, and runs full profiling.
 */
export async function createJoinView(
  plan: JoinPlan,
  queryFn: QueryFunction
): Promise<JoinViewResult> {
  const leftSchema = await detectSchema(plan.leftTable, queryFn);
  const rightSchema = await detectSchema(plan.rightTable, queryFn);

  const leftColNames = new Set(leftSchema.columns.map(c => c.name.toLowerCase()));

  // Disambiguate right table columns
  const rightProjections: string[] = [];
  for (const rCol of rightSchema.columns) {
    // If it's the exact join column on the right, we can omit it or alias it
    if (rCol.name.toLowerCase() === plan.rightColumn.toLowerCase()) {
      if (plan.leftColumn.toLowerCase() === plan.rightColumn.toLowerCase()) {
        continue; // already present from left table
      }
    }

    const escCol = `"${rCol.name.replace(/"/g, '""')}"`;
    if (leftColNames.has(rCol.name.toLowerCase())) {
      const alias = `"${plan.rightTable}_${rCol.name.replace(/"/g, '""')}"`;
      rightProjections.push(`r.${escCol} AS ${alias}`);
    } else {
      rightProjections.push(`r.${escCol}`);
    }
  }

  const escLeft = `"${plan.leftTable.replace(/"/g, '""')}"`;
  const escRight = `"${plan.rightTable.replace(/"/g, '""')}"`;
  const escView = `"${plan.viewName.replace(/"/g, '""')}"`;
  const escLeftJoinCol = `"${plan.leftColumn.replace(/"/g, '""')}"`;
  const escRightJoinCol = `"${plan.rightColumn.replace(/"/g, '""')}"`;

  const rightProjSql = rightProjections.length > 0 ? `, ${rightProjections.join(', ')}` : '';

  const sql = `
    CREATE OR REPLACE TABLE ${escView} AS 
    SELECT 
      l.*${rightProjSql}
    FROM ${escLeft} l
    ${plan.joinType} JOIN ${escRight} r
      ON l.${escLeftJoinCol} = r.${escRightJoinCol};
  `;

  await queryFn(sql);

  // Profile unified view
  const schema = await detectSchema(plan.viewName, queryFn);
  const quality = await profileQuality(plan.viewName, schema, queryFn);
  const applicableAnalyses = selectApplicableAnalyses(schema);

  const countRows = await queryFn(`SELECT count(*) as c FROM ${escView}`);
  const rowCount = Number(countRows[0]?.c || 0);

  return {
    success: true,
    viewName: plan.viewName,
    schema,
    quality,
    applicableAnalyses,
    rowCount,
  };
}
