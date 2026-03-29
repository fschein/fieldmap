const fs = require('fs');
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
  console.log("\n🚀 Bem-vindo ao Instalador do FieldMap!\n");
  console.log("Este script irá configurar o seu arquivo .env.local para conectar ao Supabase.\n");

  const url = await question("1. Digite a 'Project URL' do seu Supabase (ex: https://xyz.supabase.co): ");
  const anonKey = await question("2. Digite a 'Anon Key' (public): ");
  const serviceRole = await question("3. Digite a 'Service Role Key' (secret): ");

  const envContent = `NEXT_PUBLIC_SUPABASE_URL=${url.trim()}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey.trim()}
SUPABASE_SERVICE_ROLE_KEY=${serviceRole.trim()}
`;

  const envPath = path.join(process.cwd(), '.env.local');

  try {
    fs.writeFileSync(envPath, envContent);
    console.log(`\n✅ Arquivo .env.local criado com sucesso em: ${envPath}\n`);
    
    console.log("---------------------------------------------------------");
    console.log("🎉 PRÓXIMO PASSO: INICIALIZAR O BANCO DE DADOS");
    console.log("---------------------------------------------------------");
    console.log("1. Entre no painel do Supabase (https://app.supabase.com)");
    console.log("2. Vá em 'SQL Editor'");
    console.log("3. Clique em 'New Query'");
    console.log("4. Copie o conteúdo do arquivo 'full-setup.sql' que está na raiz deste projeto.");
    console.log("5. Cole no editor do Supabase e clique em 'RUN'.");
    console.log("---------------------------------------------------------\n");
    console.log("Após isso, você pode rodar 'npm run dev' ou 'pnpm dev' para iniciar!\n");

  } catch (err) {
    console.error("\n❌ Erro ao criar arquivo .env.local:", err.message);
  } finally {
    rl.close();
  }
}

setup();
