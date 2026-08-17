/**
 * Um registro do orçamento pode permanecer no banco como tombstone após a exclusão.
 * Fluxos de cópia nunca devem materializar novamente esses registros.
 */
export function isActiveBudgetRecord(record: Record<string, unknown>): boolean {
    return record.deleted_at == null;
}

export function onlyActiveBudgetRecords<T extends Record<string, unknown>>(records: T[]): T[] {
    return records.filter(isActiveBudgetRecord);
}
