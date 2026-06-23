import type { Surreal } from "surrealdb";

// Schema definitions for SurrealDB tables
// Execute these queries to create/update the database schema

export const clientSchema = `
-- Define client table schema with complete fields
DEFINE TABLE client SCHEMAFULL;

DEFINE FIELD name ON client TYPE string ASSERT $value != NONE AND $value != "";
DEFINE FIELD email ON client TYPE option<string>
    ASSERT $value = NONE OR string::is::email($value);
DEFINE FIELD city ON client TYPE option<string>;
DEFINE FIELD cnpj ON client TYPE option<string>;
DEFINE FIELD phone ON client TYPE option<string>;
DEFINE FIELD contact ON client TYPE option<string>;
DEFINE FIELD stateRegistration ON client TYPE option<string>;
DEFINE FIELD razao_social ON client TYPE option<string>;
DEFINE FIELD nome_fantasia ON client TYPE option<string>;
DEFINE FIELD logo_url ON client TYPE option<string>;
DEFINE FIELD informacoes_adicionais ON client FLEXIBLE TYPE option<object>;
DEFINE FIELD address ON client FLEXIBLE TYPE option<object>;
DEFINE FIELD address.cep ON client TYPE option<string>;
DEFINE FIELD address.street ON client TYPE option<string>;
DEFINE FIELD address.number ON client TYPE option<string>;
DEFINE FIELD address.complement ON client TYPE option<string>;
DEFINE FIELD address.neighborhood ON client TYPE option<string>;
DEFINE FIELD address.city ON client TYPE option<string>;
DEFINE FIELD address.state ON client TYPE option<string>;
DEFINE FIELD created_at ON client TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON client TYPE datetime DEFAULT time::now();

-- Create index for better search performance
DEFINE INDEX idx_client_name ON client FIELDS name;
DEFINE INDEX idx_client_email ON client FIELDS email;
DEFINE INDEX idx_client_city ON client FIELDS city;
DEFINE INDEX idx_client_cnpj ON client FIELDS cnpj;
DEFINE INDEX idx_client_phone ON client FIELDS phone;
DEFINE INDEX idx_client_cnpj_unique ON TABLE client COLUMNS cnpj UNIQUE;
`;

export const modelosSchema = `
DEFINE TABLE modelos SCHEMALESS;
DEFINE FIELD nome ON modelos TYPE string ASSERT $value != NONE AND $value != "";
DEFINE FIELD tipo ON modelos TYPE string ASSERT $value IN ["cabecalho", "rodape", "capa", "orcamento_completo"];
DEFINE FIELD conteudo ON modelos TYPE string;
DEFINE FIELD tenant_id ON modelos TYPE option<record<tenant>>;
DEFINE FIELD created_at ON modelos TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON modelos TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_modelos_tenant ON modelos FIELDS tenant_id;
DEFINE INDEX idx_modelos_tipo ON modelos FIELDS tipo;
`;

export const createClientTable = async (db: Surreal) => {
    try {
        await db.query(clientSchema);
        console.log("Client table schema created successfully");
    } catch (error) {
        console.error("Error creating client schema:", error);
        throw error;
    }
};

// Mock data for seeding - Empresas reais de Ponta Grossa/PR
const mockClients = [
    {
        name: "Madeireira Ponta Grossa Ltda",
        email: "contato@madeireirapg.com.br",
        city: "Ponta Grossa",
        cnpj: "84.169.331/0001-82",
        phone: "(42) 3222-3456",
        address: "Rua Coronel Dulcídio, 1235 - Centro, Ponta Grossa - PR"
    },
    {
        name: "Indústria de Móveis Progresso",
        email: "vendas@moveisprogresso.com.br",
        city: "Ponta Grossa",
        cnpj: "76.543.210/0001-99",
        phone: "(42) 3233-4567",
        address: "Avenida Carlos Cavalcanti, 2100 - Uvaranas, Ponta Grossa - PR"
    },
    {
        name: "Comércio de Madeiras Santa Rita",
        email: "santarita@madeiras.com.br",
        city: "Ponta Grossa",
        cnpj: "92.876.543/0001-15",
        phone: "(42) 3244-5678",
        address: "Rua Padre Anchieta, 789 - Oficinas, Ponta Grossa - PR"
    },
    {
        name: "Móveis e Decorações Oliveira",
        email: "oliveira@moveisdecor.com.br",
        city: "Ponta Grossa",
        cnpj: "65.432.109/0001-76",
        phone: "(42) 3255-6789",
        address: "Rua Barão do Rio Branco, 432 - Centro, Ponta Grossa - PR"
    },
    {
        name: "Madeiras e Construções Silva",
        email: "silva@madeirasconstrucoes.com.br",
        city: "Ponta Grossa",
        cnpj: "87.654.321/0001-43",
        phone: "(42) 3266-7890",
        address: "Rua Doutor Carlos de Carvalho, 876 - Centro, Ponta Grossa - PR"
    },
    {
        name: "Indústria Madeireira do Paraná",
        email: "imp@industriapr.com.br",
        city: "Ponta Grossa",
        cnpj: "43.210.987/0001-28",
        phone: "(42) 3277-8901",
        address: "Rodovia PR-151, Km 45 - Cará-Cará, Ponta Grossa - PR"
    },
    {
        name: "Móveis Rústicos Campos Gerais",
        email: "rusticos@camposgerais.com.br",
        city: "Ponta Grossa",
        cnpj: "98.765.432/0001-61",
        phone: "(42) 3288-9012",
        address: "Rua Coronel Cláudio, 654 - Centro, Ponta Grossa - PR"
    },
    {
        name: "Comercial Madeireira Planalto",
        email: "planalto@madeireira.com.br",
        city: "Ponta Grossa",
        cnpj: "54.321.098/0001-87",
        phone: "(42) 3299-0123",
        address: "Avenenda Coronel Taumaturgo, 1234 - Uvaranas, Ponta Grossa - PR"
    }
];

// Function to seed clients data
export const seedClients = async (db: Surreal) => {
    try {
        console.log("Starting client seed...");
        
        // Check if clients already exist
        const existingClients = await db.query<[{ total: number }[]]>("SELECT count() as total FROM client");
        const total = existingClients?.[0]?.[0]?.total || 0;
        
        if (total > 0) {
            console.log(`Clients table already has ${total} records. Skipping seed.`);
            return;
        }
        
        // Insert mock clients
        for (const client of mockClients) {
            await db.query(
                `CREATE client SET 
                    name = $name,
                    email = $email,
                    city = $city,
                    cnpj = $cnpj,
                    phone = $phone,
                    address = $address,
                    created_at = time::now(),
                    updated_at = time::now()`,
                client
            );
        }
        
        console.log(`Successfully seeded ${mockClients.length} clients`);
    } catch (error) {
        console.error("Error seeding clients:", error);
        throw error;
    }
};

// Migration function to add city and cnpj fields to existing client table
export const addClientFieldsMigration = async (db: Surreal) => {
    try {
        // Add city field if it doesn't exist
        await db.query(`
            IF NOT EXISTS (SELECT * FROM information_schema.columns 
                          WHERE table_name = 'client' AND column_name = 'city') THEN
                ALTER TABLE client ADD COLUMN city STRING;
            END IF;
        `);
        
        // Add cnpj field if it doesn't exist
        await db.query(`
            IF NOT EXISTS (SELECT * FROM information_schema.columns 
                          WHERE table_name = 'client' AND column_name = 'cnpj') THEN
                ALTER TABLE client ADD COLUMN cnpj STRING;
            END IF;
        `);
        
        console.log("Migration completed: city and cnpj fields added to client table");
    } catch (error) {
        console.error("Error running migration:", error);
        throw error;
    }
};

// Complete setup function - creates table and seeds data
export const setupClientTable = async (db: Surreal) => {
    try {
        console.log("Setting up client table...");
        
        // Create table schema
        await createClientTable(db);
        
        // Seed with mock data
        await seedClients(db);
        
        console.log("Client table setup completed successfully!");
    } catch (error) {
        console.error("Error setting up client table:", error);
        throw error;
    }
};
