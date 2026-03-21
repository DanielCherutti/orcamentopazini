#!/usr/bin/env tsx

/**
 * Script de Verificação - Produtos
 * 
 * Verifica quantos produtos existem no banco
 * 
 * Uso: npx tsx verify-products.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { getDb } from "./src/lib/surreal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, ".env") });

const TABLE_NAME = "product";
const DEFAULT_COMPANY_ID = 0;

async function verifyProducts() {
    console.log("🔍 Verificando produtos no banco...\n");

    const db = await getDb();

    try {
        // Lista TODOS os produtos para contar manualmente
        interface ProductRow { company_id: number; code: string; description: string; [key: string]: unknown }
        const allProductsResult = await db.query<[ProductRow[]]>(
            `SELECT * FROM ${TABLE_NAME}`
        );
        const allProducts = allProductsResult[0] || [];
        console.log(`📊 Total de produtos (todos): ${allProducts.length}`);

        // Filtra por company_id
        const companyProducts = allProducts.filter((p) => p.company_id === DEFAULT_COMPANY_ID);
        console.log(`📊 Total de produtos (company_id=${DEFAULT_COMPANY_ID}): ${companyProducts.length}`);

        // Lista os primeiros 10 produtos
        const first10 = allProducts.slice(0, 10);

        if (first10.length > 0) {
            console.log(`\n📦 Primeiros ${first10.length} produtos:`);
            first10.forEach((p) => {
                console.log(`   - ${p.code}: ${p.description}`);
            });
        }

    } catch (error) {
        console.error("❌ Erro ao verificar produtos:", error);
        process.exit(1);
    }

    process.exit(0);
}

// Executa a verificação
verifyProducts();
