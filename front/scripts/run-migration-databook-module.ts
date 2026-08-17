import { getDb } from "@/lib/surreal";

const statements = [
    "DEFINE TABLE IF NOT EXISTS databook SCHEMALESS",
    "DEFINE TABLE IF NOT EXISTS databook_section SCHEMALESS",
    "DEFINE TABLE IF NOT EXISTS databook_installation SCHEMALESS",
    "DEFINE TABLE IF NOT EXISTS databook_installation_product SCHEMALESS",
    "DEFINE TABLE IF NOT EXISTS databook_media SCHEMALESS",
    "DEFINE TABLE IF NOT EXISTS databook_attachment SCHEMALESS",
    "DEFINE TABLE IF NOT EXISTS product_databook_config SCHEMALESS",
    "DEFINE TABLE IF NOT EXISTS product_manual SCHEMALESS",
    "DEFINE TABLE IF NOT EXISTS document_generation_job SCHEMALESS",
    "DEFINE INDEX IF NOT EXISTS idx_databook_tenant ON databook FIELDS tenant_id",
    "DEFINE INDEX IF NOT EXISTS idx_databook_client ON databook FIELDS client_id",
    "DEFINE INDEX IF NOT EXISTS idx_databook_section_document ON databook_section FIELDS databook_id",
    "DEFINE INDEX IF NOT EXISTS idx_databook_installation_document ON databook_installation FIELDS databook_id",
    "DEFINE INDEX IF NOT EXISTS idx_databook_product_installation ON databook_installation_product FIELDS databook_installation_id",
    "DEFINE INDEX IF NOT EXISTS idx_databook_media_document ON databook_media FIELDS databook_id",
    "DEFINE INDEX IF NOT EXISTS idx_databook_attachment_document ON databook_attachment FIELDS databook_id",
    "DEFINE INDEX IF NOT EXISTS idx_product_databook_config_product ON product_databook_config FIELDS product_id UNIQUE",
    "DEFINE INDEX IF NOT EXISTS idx_product_manual_product ON product_manual FIELDS product_id",
    "DEFINE INDEX IF NOT EXISTS idx_document_generation_document ON document_generation_job FIELDS document_type, document_id",
];

export async function run(): Promise<void> {
    const db = await getDb();
    for (const statement of statements) {
        await db.query(`${statement};`);
    }
}
