import type { Metadata } from "next";
import Link from "next/link";
import { CompleteInviteForm } from "@/components/auth/complete-invite-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export const metadata: Metadata = {
    title: "Criar senha",
    robots: { index: false, follow: false },
};

export default async function ConvitePage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const { token } = await searchParams;
    const raw = token?.trim() ?? "";
    const validToken = raw.length >= 32;

    return (
        <div className="min-h-dvh flex items-center justify-center p-4 bg-muted/30">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader>
                    <CardTitle>Criar sua senha</CardTitle>
                    <CardDescription>
                        Defina uma senha forte para acessar o portal. Depois você
                        poderá entrar na tela inicial com e-mail e senha.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!validToken ? (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Link inválido</AlertTitle>
                            <AlertDescription className="space-y-2">
                                <p>
                                    Abra o link completo enviado por e-mail ou peça
                                    um novo convite ao administrador.
                                </p>
                                <Link
                                    href="/"
                                    className="text-sm font-medium underline underline-offset-4"
                                >
                                    Voltar ao login
                                </Link>
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <CompleteInviteForm token={raw} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
