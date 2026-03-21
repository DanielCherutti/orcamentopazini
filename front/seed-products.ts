#!/usr/bin/env tsx

/**
 * Script de Seed - Produtos
 * 
 * Gera 50 produtos de teste para o sistema Pazini
 * 
 * Uso: npx tsx seed-products.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Table } from "surrealdb";
import { getDb } from "./src/lib/surreal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, ".env") });


const TABLE_NAME = "product";
const DEFAULT_COMPANY_ID = 0;

// Categorias de produtos para variedade
const categories = [
    { prefix: "EQ", name: "Equipamento", units: ["UN", "KG", "M"] },
    { prefix: "MT", name: "Material", units: ["M", "M²", "M³", "KG"] },
    { prefix: "FX", name: "Fixação", units: ["UN", "CX", "PCT"] },
    { prefix: "AC", name: "Acessório", units: ["UN", "PAR", "JG"] },
    { prefix: "CB", name: "Cabo", units: ["M", "RL", "UN"] },
];

// Descrições base para produtos
const productDescriptions = [
    "Parafuso Sextavado",
    "Chapa de Aço",
    "Tubo de PVC",
    "Conector Elétrico",
    "Cabo de Rede",
    "Suporte de Fixação",
    "Abraçadeira Metálica",
    "Fita Isolante",
    "Terminal de Conexão",
    "Caixa de Passagem",
    "Conduíte Flexível",
    "Eletrocalha Perfurada",
    "Painel de Distribuição",
    "Disjuntor Termomagnético",
    "Tomada Industrial",
    "Plugue de Conexão",
    "Interruptor Bipolar",
    "Lâmpada LED",
    "Luminária Embutir",
    "Refletor LED",
    "Sensor de Presença",
    "Controlador de Acesso",
    "Câmera de Segurança",
    "DVR 16 Canais",
    "Fonte de Alimentação",
    "Bateria Estacionária",
    "Nobreak",
    "Estabilizador de Tensão",
    "Transformador",
    "Quadro de Comando",
    "Botoeira de Emergência",
    "Sinaleiro LED",
    "Relé de Proteção",
    "Contator Tripolar",
    "Fusível NH",
    "Seccionadora Tripolar",
    "Eletroduto Galvanizado",
    "Curva 90° PVC",
    "Luva de Emenda",
    "Bucha de Redução",
    "Arruela Lisa",
    "Porca Sextavada",
    "Parafuso Francês",
    "Chumbador Químico",
    "Âncora de Expansão",
    "Grampo U",
    "Presilha Plástica",
    "Fita Dupla Face",
    "Silicone Acético",
    "Massa de Vedação",
];

// Especificações técnicas para descrições detalhadas
const technicalSpecs = [
    "Fabricado em aço carbono com tratamento anticorrosivo",
    "Material de alta resistência conforme norma ABNT NBR",
    "Certificado pelo INMETRO para uso industrial",
    "Resistente a intempéries e variações de temperatura",
    "Instalação rápida e fácil manutenção",
    "Compatível com sistemas de automação predial",
    "Baixo consumo energético e alta eficiência",
    "Garantia de 12 meses contra defeitos de fabricação",
    "Produto sustentável com materiais recicláveis",
    "Atende às normas de segurança NR-10 e NR-12",
];

// Função para gerar número aleatório em um intervalo
function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Função para gerar preço aleatório
function randomPrice(min: number, max: number): number {
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

// Função para gerar descrição detalhada em HTML
function generateDetailedDescription(productName: string, category: string): string {
    const specs = [];

    // Adiciona 3-5 especificações aleatórias
    const numSpecs = randomInt(3, 5);
    const shuffled = [...technicalSpecs].sort(() => 0.5 - Math.random());

    for (let i = 0; i < numSpecs; i++) {
        specs.push(shuffled[i]);
    }

    return `
<h2>Descrição Técnica</h2>
<p><strong>${productName}</strong> - ${category}</p>

<h3>Características Principais</h3>
<ul>
${specs.map(spec => `  <li>${spec}</li>`).join('\n')}
</ul>

<h3>Aplicações</h3>
<p>Ideal para uso em instalações elétricas, sistemas de automação, projetos industriais e comerciais.</p>

<h3>Observações</h3>
<p>Produto deve ser instalado por profissional qualificado seguindo as normas técnicas vigentes.</p>
  `.trim();
}

// Função principal de seed
async function seedProducts() {
    console.log("🌱 Iniciando seed de produtos...\n");

    // Debug das variáveis de ambiente
    console.log("🔍 Verificando configuração:");
    const host = process.env.SURREALDB_HOST || "127.0.0.1";
    const port = process.env.SURREALDB_PORT || "8000";
    console.log(`   URL: ${process.env.SURREAL_URL || `http://${host}:${port}`}`);
    console.log(`   NS: ${process.env.SURREAL_NS || process.env.SURREALDB_NS || "pazini"}`);
    console.log(`   DB: ${process.env.SURREAL_DB || process.env.SURREALDB_DB || "core"}`);
    console.log(`   USER: ${process.env.SURREAL_USER || process.env.SURREALDB_USER || "admin"}`);
    console.log(`   PASS: ${(process.env.SURREAL_PASS || process.env.SURREALDB_PASS) ? "***" : "(vazio)"}\n`);

    const db = await getDb();

    try {
        // Verifica se já existem produtos
        const existing = await db.query<[{ count: number }[]]>(
            `SELECT count() AS count FROM ${TABLE_NAME} WHERE company_id = $company_id`,
            { company_id: DEFAULT_COMPANY_ID }
        );

        const currentCount = existing[0]?.[0]?.count || 0;

        if (currentCount > 0) {
            console.log(`⚠️  Já existem ${currentCount} produtos no banco.`);
            console.log("   Deseja continuar e adicionar mais 50 produtos? (Ctrl+C para cancelar)\n");

            // Aguarda 3 segundos para dar tempo de cancelar
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        const products = [];

        // Gera 50 produtos
        for (let i = 1; i <= 50; i++) {
            const category = categories[randomInt(0, categories.length - 1)];
            const descIndex = randomInt(0, productDescriptions.length - 1);
            const description = productDescriptions[descIndex];
            const unit = category.units[randomInt(0, category.units.length - 1)];

            // Código único com prefixo da categoria + número sequencial
            const code = `${category.prefix}-${String(i).padStart(4, '0')}`;

            // Preços variados
            const equipmentPrice = randomPrice(10, 5000);
            const assemblyPrice = randomPrice(5, equipmentPrice * 0.3); // Montagem é até 30% do equipamento

            const product = {
                company_id: DEFAULT_COMPANY_ID,
                code,
                description: `${description} ${category.name}`,
                detailedDescription: generateDetailedDescription(description, category.name),
                unit,
                equipmentPrice,
                assemblyPrice,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            products.push(product);
        }

        // Insere produtos em lote
        console.log("📦 Inserindo 50 produtos no banco de dados...\n");

        const productTable = new Table(TABLE_NAME);
        for (const product of products) {
            // SurrealDB.js v2+: create() exige Table, não string
            await db.create(productTable).content(product);
            console.log(`✅ ${product.code} - ${product.description}`);
        }

        console.log("\n🎉 Seed concluído com sucesso!");
        console.log(`   Total de produtos criados: ${products.length}`);

        // Verifica total final
        const final = await db.query<[{ count: number }[]]>(
            `SELECT count() AS count FROM ${TABLE_NAME} WHERE company_id = $company_id`,
            { company_id: DEFAULT_COMPANY_ID }
        );

        const finalCount = final[0]?.[0]?.count || 0;
        console.log(`   Total de produtos no banco: ${finalCount}\n`);

    } catch (error) {
        console.error("❌ Erro ao executar seed:", error);
        process.exit(1);
    }

    process.exit(0);
}

// Executa o seed
seedProducts();
