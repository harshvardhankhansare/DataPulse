import { TableSchema } from '../schema/schemaTypes.js';
import { ActiveFilter } from './filterTypes.js';
import { getPrioritizedCategoricalColumns, getPrioritizedNumericColumns } from '../schema/typeDetector.js';

type QueryFunction = (sql: string) => Promise<any[]>;

export interface GroupAggregationRow {
  category: string;
  avg_value: number;
  sum_value: number;
  count: number;
}

export interface GroupAggregationResult {
  categoryColumn: string;
  numericColumn: string;
  rows: GroupAggregationRow[];
}

/**
 * Run group aggregation: for each category value, compute avg/sum/count of a numeric column.
 * If a filter is applied on the primary category, automatically drills down into the secondary category if present.
 */
export async function runGroupAggregation(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction,
  filter?: ActiveFilter
): Promise<GroupAggregationResult> {
  const catCols = getPrioritizedCategoricalColumns(schema);
  const numerics = getPrioritizedNumericColumns(schema);
  const numCol = numerics[0];

  if (catCols.length === 0 || !numCol) {
    throw new Error('group_aggregation requires at least one categorical and one numeric column');
  }

  // Drill-down: if filter matches first catCol and there's another catCol, group by second catCol
  let catCol = catCols[0];
  if (filter && filter.column === catCol.name && catCols.length > 1) {
    catCol = catCols[1];
  }

  const filterClause = filter 
    ? `AND "${filter.column.replace(/"/g, '""')}" = '${String(filter.value).replace(/'/g, "''")}'` 
    : '';

  const rows = await queryFn(`
    SELECT
      CAST("${catCol.name}" AS VARCHAR) AS category,
      ROUND(AVG("${numCol.name}"), 4)   AS avg_value,
      ROUND(SUM("${numCol.name}"), 4)   AS sum_value,
      COUNT(*)                          AS count
    FROM ${tableName}
    WHERE "${catCol.name}" IS NOT NULL
      AND "${numCol.name}" IS NOT NULL
      ${filterClause}
    GROUP BY "${catCol.name}"
    ORDER BY avg_value DESC
    LIMIT 15
  `);

  return {
    categoryColumn: catCol.name,
    numericColumn: numCol.name,
    rows: rows.map(r => ({
      category: String(r.category),
      avg_value: Number(r.avg_value),
      sum_value: Number(r.sum_value),
      count: Number(r.count),
    })),
  };
}
