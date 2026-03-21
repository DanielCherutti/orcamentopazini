import { loginAction } from "@/actions/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl shadow-lg border border-border">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-primary">Pazini</h1>
          <p className="text-muted-foreground">Entre para continuar</p>
        </div>

        {error === "invalid" && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center">
            Email ou senha incorretos.
          </div>
        )}

        {error === "ratelimit" && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center">
            Muitas tentativas de login a partir deste endereço. Aguarde alguns minutos e tente
            novamente.
          </div>
        )}

        {error === "expired" && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center">
            Sua sessão expirou. Faça login novamente.
          </div>
        )}

        {error === "config" && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center space-y-1">
            <p>
              Defina <code className="text-xs">JWT_SECRET</code> (mín. 32 caracteres) no{" "}
              <code className="text-xs">.env</code>.
            </p>
            <p className="text-xs opacity-90">
              O login usa usuários no banco. Crie o primeiro com{" "}
              <code className="text-xs">bun run seed:portal-user</code> (usa{" "}
              <code className="text-xs">PAZINI_LOGIN_*</code> no .env) ou pela tela Usuários após entrar.
            </p>
          </div>
        )}

        <form action={loginAction} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
