import { TableSchema, ColumnType } from '../schema/schemaTypes.js';
import { ActiveFilter } from '../analytics/filterTypes.js';
import {
  SimulationConfig,
  SimulationDriver,
  SimulationResult,
  DriverSensitivity,
} from './scenarioTypes.js';

type QueryFunction = (sql: string) => Promise<any[]>;

/**
 * Automatically detects the outcome target column and candidate simulation drivers.
 */
export async function detectSimulationConfig(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction
): Promise<SimulationConfig> {
  const numerics = schema.columns.filter(
    c => c.detectedType === ColumnType.NUMERIC &&
         !c.name.toLowerCase().endsWith('_id') &&
         c.name.toLowerCase() !== 'id'
  );

  if (numerics.length === 0) {
    throw new Error('Simulation requires at least one numeric column');
  }

  // Priority detection for business outcome targets
  const targetPattern = /revenue|sales|profit|amount|total|price|cost|score|salary|value|spend/i;
  const targetCandidate = numerics.find(c => targetPattern.test(c.name)) || numerics[0];
  const targetColumn = targetCandidate.name;

  const availableTargets = numerics.map(c => c.name);

  // Pick up to 5 drivers (prioritizing non-target numeric metrics)
  const driverCandidates = numerics.filter(c => c.name !== targetColumn).slice(0, 4);
  if (driverCandidates.length === 0) {
    driverCandidates.push(targetCandidate);
  }

  const drivers: SimulationDriver[] = [];
  for (const col of driverCandidates) {
    const esc = `"${col.name.replace(/"/g, '""')}"`;
    const rows = await queryFn(`
      SELECT
        ROUND(COALESCE(AVG(${esc}), 0), 2) AS avg_val,
        ROUND(COALESCE(SUM(${esc}), 0), 2) AS sum_val
      FROM ${tableName}
      WHERE ${esc} IS NOT NULL
    `);
    const r = rows[0] || {};
    drivers.push({
      name: col.name,
      label: col.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      currentAvg: Number(r.avg_val || 0),
      currentSum: Number(r.sum_val || 0),
    });
  }

  return {
    targetColumn,
    availableTargets,
    drivers,
  };
}

/**
 * Runs a simulated projection comparing baseline vs. adjusted outcomes.
 */
export async function runSimulation(
  tableName: string,
  _schema: TableSchema,
  queryFn: QueryFunction,
  targetCol: string,
  adjustments: Record<string, number>,
  filter?: ActiveFilter
): Promise<SimulationResult> {
  const targetEsc = `"${targetCol.replace(/"/g, '""')}"`;
  const filterWhere = filter
    ? `WHERE "${filter.column.replace(/"/g, '""')}" = '${String(filter.value).replace(/'/g, "''")}'`
    : '';

  // 1. Fetch baseline
  const baselineRows = await queryFn(`
    SELECT
      ROUND(COALESCE(SUM(${targetEsc}), 0), 2) AS total,
      ROUND(COALESCE(AVG(${targetEsc}), 0), 2) AS avg
    FROM ${tableName}
    ${filterWhere}
  `);
  const bRow = baselineRows[0] || {};
  const baselineTotal = Number(bRow.total || 0);
  const baselineAvg = Number(bRow.avg || 0);

  // 2. Compute compounded multi-lever multiplier
  let compoundMultiplier = 1;
  const driverKeys = Object.keys(adjustments);
  for (const k of driverKeys) {
    const percent = adjustments[k] || 0;
    compoundMultiplier *= (1 + percent / 100);
  }

  const projectedTotal = Number((baselineTotal * compoundMultiplier).toFixed(2));
  const projectedAvg = Number((baselineAvg * compoundMultiplier).toFixed(2));
  const deltaTotal = Number((projectedTotal - baselineTotal).toFixed(2));
  const percentChange = baselineTotal > 0
    ? Number(((deltaTotal / baselineTotal) * 100).toFixed(2))
    : 0;

  // 3. Compute sensitivity rankings (+10% marginal leverage on each driver)
  const sensitivity: DriverSensitivity[] = driverKeys.map(k => {
    const standardTenPercentDelta = Number((baselineTotal * 0.10).toFixed(2));
    return {
      driverName: k,
      impactPerTenPercent: standardTenPercentDelta,
      percentageImpact: 10,
      elasticityRank: 1,
    };
  });

  // Sort by marginal impact descending
  sensitivity.sort((a, b) => b.impactPerTenPercent - a.impactPerTenPercent);
  sensitivity.forEach((s, idx) => {
    s.elasticityRank = idx + 1;
  });

  return {
    targetColumn: targetCol,
    baselineTotal,
    baselineAvg,
    projectedTotal,
    projectedAvg,
    deltaTotal,
    percentChange,
    sensitivity,
  };
}
