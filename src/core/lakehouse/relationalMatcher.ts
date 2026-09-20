import { LakehouseTable, JoinCandidate } from './lakehouseTypes.js';

type QueryFunction = (sql: string) => Promise<any[]>;

export async function detectJoinCandidates(
  tables: LakehouseTable[],
  queryFn: QueryFunction
): Promise<JoinCandidate[]> {
  const candidates: JoinCandidate[] = [];

  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const tableA = tables[i];
      const tableB = tables[j];

      for (const colA of tableA.columns) {
        for (const colB of tableB.columns) {
          const nameA = colA.name.toLowerCase();
          const nameB = colB.name.toLowerCase();

          let matchScore = 0;

          // 1. Exact name match on key patterns
          if (nameA === nameB && (nameA.endsWith('_id') || nameA.endsWith('id') || nameA === 'sku' || nameA === 'code' || nameA === 'email')) {
            matchScore = 100;
          } else if (nameA === nameB) {
            // Exact name match on non-id columns (e.g. region, country)
            matchScore = 60;
          } else if (
            // Foreign key to primary key match: e.g. customer_id to id
            (nameA.includes(tableB.tableName.toLowerCase()) && nameA.endsWith('id') && nameB === 'id') ||
            (nameB.includes(tableA.tableName.toLowerCase()) && nameB.endsWith('id') && nameA === 'id') ||
            (nameA.endsWith('_id') && nameB === 'id') ||
            (nameB.endsWith('_id') && nameA === 'id')
          ) {
            matchScore = 85;
          }

          if (matchScore >= 60) {
            // Determine left vs right table based on naming convention
            let leftT = tableA;
            let leftC = colA.name;
            let rightT = tableB;
            let rightC = colB.name;

            // If tableA has 'id' and tableB has 'something_id', put something_id on the left
            if (colA.name.toLowerCase() === 'id' && colB.name.toLowerCase().endsWith('_id')) {
              leftT = tableB;
              leftC = colB.name;
              rightT = tableA;
              rightC = colA.name;
            }

            // Verify overlap in DuckDB
            const escLeftT = `"${leftT.tableName.replace(/"/g, '""')}"`;
            const escRightT = `"${rightT.tableName.replace(/"/g, '""')}"`;
            const escLeftC = `"${leftC.replace(/"/g, '""')}"`;
            const escRightC = `"${rightC.replace(/"/g, '""')}"`;

            try {
              const overlapQuery = `
                WITH left_keys AS (
                  SELECT DISTINCT CAST(${escLeftC} AS VARCHAR) as k 
                  FROM ${escLeftT} 
                  WHERE ${escLeftC} IS NOT NULL
                ),
                right_keys AS (
                  SELECT DISTINCT CAST(${escRightC} AS VARCHAR) as k 
                  FROM ${escRightT} 
                  WHERE ${escRightC} IS NOT NULL
                )
                SELECT 
                  (SELECT count(*) FROM (SELECT k FROM left_keys INTERSECT SELECT k FROM right_keys)) as overlap_cnt,
                  (SELECT count(*) FROM left_keys) as total_left;
              `;

              const rows = await queryFn(overlapQuery);
              const overlapCnt = Number(rows[0]?.overlap_cnt || 0);
              const totalLeft = Number(rows[0]?.total_left || 1);
              const overlapPct = Math.round((overlapCnt / totalLeft) * 100);

              if (overlapCnt > 0) {
                candidates.push({
                  leftTable: leftT.tableName,
                  leftColumn: leftC,
                  rightTable: rightT.tableName,
                  rightColumn: rightC,
                  confidence: overlapPct >= 40 || matchScore >= 85 ? 'high' : 'medium',
                  overlapCount: overlapCnt,
                  overlapPct,
                  recommendedJoinType: 'LEFT',
                });
              }
            } catch (err) {
              console.warn('[Relational Matcher] Overlap query error:', err);
            }
          }
        }
      }
    }
  }

  // Sort candidates by confidence and overlap percentage
  return candidates.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === 'high' ? -1 : 1;
    }
    return b.overlapPct - a.overlapPct;
  });
}
