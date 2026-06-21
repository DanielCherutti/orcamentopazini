"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
    clearPlatformAsaasSettingsAction,
    testPlatformAsaasConnectionAction,
    updatePlatformAsaasSettingsAction,
} from "@/actions/platform-billing-settings-actions";
import type { PlatformAsaasSettingsPublic } from "@/lib/asaas/config";
import type { AsaasEnv } from "@/lib/asaas/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";
import { toast } from "@/lib/toast";
import { Loader2, PlugZap, Save, Trash2 } from "lucide-react";

type Props = {
    initial: PlatformAsaasSettingsPublic;
};

export function PlatformAsaasSettingsForm({ initial }: Props) {
    const router = useRouter();
    const { can } = usePlatformPermissions();
    const canEdit = can("billing.write");

    const [env, setEnv] = useState<AsaasEnv>(initial.env);
    const [apiKey, setApiKey] = useState("");
    const [webhookToken, setWebhookToken] = useState(initial.webhookToken);
    const [pending, startTransition] = useTransition();
    const [testPending, startTestTransition] = useTransition();

    function save(e: React.FormEvent) {
        e.preventDefault();
        startTransition(async () => {
            const res = await updatePlatformAsaasSettingsAction({
                env,
                apiKey: apiKey.trim() || undefined,
                webhookToken,
            });
            if (!res.success) {
                if (res.fieldErrors?.apiKey?.[0]) toast.error(res.fieldErrors.apiKey[0]);
                else toast.error(res.error ?? "Erro ao salvar");
                return;
            }
            toast.success("Integração Asaas salva");
            setApiKey("");
            router.refresh();
        });
    }

    function testConnection() {
        startTestTransition(async () => {
            const res = await testPlatformAsaasConnectionAction({
                apiKey: apiKey.trim() || undefined,
                env,
            });
            if (!res.success) {
                toast.error(res.error ?? "Falha na conexão");
                return;
            }
            toast.success(
                res.accountName
                    ? `${res.message} — ${res.accountName}`
                    : (res.message ?? "Conexão OK"),
            );
        });
    }

    function clearStored() {
        if (!confirm("Remover chave salva no banco? O .env ainda pode ser usado como fallback.")) {
            return;
        }
        startTransition(async () => {
            const res = await clearPlatformAsaasSettingsAction();
            if (!res.success) {
                toast.error(res.error ?? "Erro");
                return;
            }
            toast.success("Configuração removida do banco");
            router.refresh();
        });
    }

    const sourceLabel =
        initial.source === "database"
            ? "Salva na plataforma"
            : initial.source === "env"
              ? "Variável de ambiente (.env)"
              : "Não configurada";

    return (
        <Card className="platform-ops-surface border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <PlugZap className="size-4" />
                    Integração Asaas
                </CardTitle>
                <CardDescription>
                    Chave de API, ambiente e token do webhook. Prioridade: configuração da plataforma,
                    depois <code className="text-xs">.env</code>.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{sourceLabel}</Badge>
                    {initial.apiKeyConfigured && initial.apiKeyHint && (
                        <Badge variant="secondary">Chave {initial.apiKeyHint}</Badge>
                    )}
                    {initial.updatedAt && (
                        <span className="text-xs text-muted-foreground">
                            Atualizado {initial.updatedAt.slice(0, 16).replace("T", " ")}
                            {initial.updatedBy ? ` por ${initial.updatedBy}` : ""}
                        </span>
                    )}
                </div>

                {!canEdit && (
                    <p className="mb-4 text-sm text-muted-foreground">
                        Somente leitura — peça a um Super Admin ou Comercial para alterar.
                    </p>
                )}

                <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="asaas-env">Ambiente</Label>
                        <Select
                            value={env}
                            onValueChange={(v) => setEnv(v as AsaasEnv)}
                            disabled={!canEdit || pending}
                        >
                            <SelectTrigger id="asaas-env">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                                <SelectItem value="production">Produção</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="asaas-api-key">Chave de API (access_token)</Label>
                        <Input
                            id="asaas-api-key"
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={
                                initial.apiKeyConfigured
                                    ? "Deixe em branco para manter a chave atual"
                                    : "Cole a chave do painel Asaas → Integrações → API"
                            }
                            disabled={!canEdit || pending}
                            autoComplete="off"
                        />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="asaas-webhook-token">Token do webhook (opcional)</Label>
                        <Input
                            id="asaas-webhook-token"
                            value={webhookToken}
                            onChange={(e) => setWebhookToken(e.target.value)}
                            placeholder="Mesmo valor configurado no Asaas ao cadastrar a URL do webhook"
                            disabled={!canEdit || pending}
                            autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                            URL do webhook:{" "}
                            <code className="rounded bg-muted px-1">
                                {typeof window !== "undefined"
                                    ? `${window.location.origin}/api/webhooks/asaas`
                                    : "/api/webhooks/asaas"}
                            </code>
                        </p>
                    </div>
                    {canEdit && (
                        <div className="sm:col-span-2 flex flex-wrap gap-2">
                            <Button type="submit" disabled={pending || testPending}>
                                {pending ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Save className="size-4" />
                                )}
                                Salvar
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                disabled={pending || testPending}
                                onClick={testConnection}
                            >
                                {testPending ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <PlugZap className="size-4" />
                                )}
                                Testar conexão
                            </Button>
                            {initial.source === "database" && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={pending || testPending}
                                    onClick={clearStored}
                                >
                                    <Trash2 className="size-4" />
                                    Remover do banco
                                </Button>
                            )}
                        </div>
                    )}
                </form>
            </CardContent>
        </Card>
    );
}
