"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
    ProposalSettings,
    updateProposalSettingsAction,
} from "@/actions/settings-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { Loader2, Mail } from "lucide-react";

export function SettingsForm({ initialSettings }: { initialSettings: ProposalSettings }) {
    const router = useRouter();
    const [formData, setFormData] = useState(initialSettings);
    const [smtpPassNew, setSmtpPassNew] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setFormData(initialSettings);
    }, [initialSettings]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await updateProposalSettingsAction({
                ...formData,
                smtp_pass_new: smtpPassNew.trim() || undefined,
            });
            if (res.success) {
                toast.success("Configurações salvas!");
                setSmtpPassNew("");
                router.refresh();
            } else {
                toast.error(res.error || "Erro ao salvar");
            }
        } catch {
            toast.error("Erro inesperado");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto pb-10">
            <div className="flex justify-between items-center mb-2 mt-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Configurações da Empresa</h1>
                    <p className="text-muted-foreground">
                        Identidade visual, textos das propostas e envio de e-mail (convites de usuário).
                    </p>
                </div>
                <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Salvar Alterações
                </Button>
            </div>

            {/* Identidade Visual */}
            <Card>
                <CardHeader>
                    <CardTitle>Identidade Visual</CardTitle>
                    <CardDescription>
                        Defina como sua marca aparece nas propostas. A <strong>cor primária</strong> e a{" "}
                        <strong>cor secundária</strong> também atualizam o painel interno, o menu lateral e a tela de
                        login (após salvar).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Nome da Empresa (Exibição)</Label>
                            <Input
                                value={formData.company_name || ""}
                                onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>URL do Logo</Label>
                            <Input
                                value={formData.company_logo_url || ""}
                                onChange={e => setFormData({ ...formData, company_logo_url: e.target.value })}
                                placeholder="https://..."
                            />
                            <p className="text-xs text-muted-foreground">Cole uma URL pública ou Data URI da sua logo.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Cor Primária (Hex)</Label>
                            <div className="flex gap-2">
                                <div className="relative">
                                    <Input
                                        type="color"
                                        className="w-12 h-10 p-1 cursor-pointer absolute opacity-0"
                                        value={formData.primary_color || "#000000"}
                                        onChange={e => setFormData({ ...formData, primary_color: e.target.value })}
                                    />
                                    <div className="w-12 h-10 rounded border" style={{ backgroundColor: formData.primary_color }}></div>
                                </div>
                                <Input
                                    value={formData.primary_color || ""}
                                    onChange={e => setFormData({ ...formData, primary_color: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Cor Secundária (Hex)</Label>
                            <div className="flex gap-2">
                                <div className="relative">
                                    <Input
                                        type="color"
                                        className="w-12 h-10 p-1 cursor-pointer absolute opacity-0"
                                        value={formData.secondary_color || "#000000"}
                                        onChange={e => setFormData({ ...formData, secondary_color: e.target.value })}
                                    />
                                    <div className="w-12 h-10 rounded border" style={{ backgroundColor: formData.secondary_color }}></div>
                                </div>
                                <Input
                                    value={formData.secondary_color || ""}
                                    onChange={e => setFormData({ ...formData, secondary_color: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* E-mail / convites */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Mail className="size-5" />
                        E-mail (convites de usuário)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="app_public_url">URL pública do sistema</Label>
                        <Input
                            id="app_public_url"
                            value={formData.app_public_url || ""}
                            onChange={(e) =>
                                setFormData({ ...formData, app_public_url: e.target.value })
                            }
                            placeholder="https://portal.suaempresa.com"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="smtp_host">Servidor SMTP</Label>
                            <Input
                                id="smtp_host"
                                value={formData.smtp_host || ""}
                                onChange={(e) =>
                                    setFormData({ ...formData, smtp_host: e.target.value })
                                }
                                placeholder="smtp.office365.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="smtp_port">Porta</Label>
                            <Input
                                id="smtp_port"
                                type="number"
                                min={1}
                                max={65535}
                                value={formData.smtp_port ?? ""}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setFormData({
                                        ...formData,
                                        smtp_port: v === "" ? undefined : Number(v) || undefined,
                                    });
                                }}
                                placeholder="587"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="smtp_secure"
                            checked={Boolean(formData.smtp_secure)}
                            onCheckedChange={(c) =>
                                setFormData({
                                    ...formData,
                                    smtp_secure: c === true,
                                })
                            }
                        />
                        <Label htmlFor="smtp_secure" className="text-sm font-normal cursor-pointer">
                            Conexão segura direta (SSL na porta 465) — para Microsoft 365 na 587 deixe
                            desmarcado
                        </Label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="smtp_user">Usuário / e-mail SMTP</Label>
                            <Input
                                id="smtp_user"
                                type="email"
                                autoComplete="off"
                                value={formData.smtp_user || ""}
                                onChange={(e) =>
                                    setFormData({ ...formData, smtp_user: e.target.value })
                                }
                                placeholder="noreply@empresa.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="smtp_from">Remetente (From)</Label>
                            <Input
                                id="smtp_from"
                                type="email"
                                autoComplete="off"
                                value={formData.smtp_from || ""}
                                onChange={(e) =>
                                    setFormData({ ...formData, smtp_from: e.target.value })
                                }
                                placeholder="igual ao usuário ou alias autorizado"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="smtp_pass_new">Senha SMTP</Label>
                        <Input
                            id="smtp_pass_new"
                            type="password"
                            autoComplete="new-password"
                            value={smtpPassNew}
                            onChange={(e) => setSmtpPassNew(e.target.value)}
                            placeholder={
                                formData.smtp_pass_configured
                                    ? "Deixe em branco para manter a senha atual"
                                    : "Senha da conta ou senha de aplicativo (M365)"
                            }
                        />
                        {formData.smtp_pass_configured && (
                            <p className="text-xs text-muted-foreground">
                                Já existe uma senha salva. Preencha só se quiser substituir.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Textos Padrão */}
            <Card>
                <CardHeader>
                    <CardTitle>Textos de Proposta</CardTitle>
                    <CardDescription>Edite os textos padrão gerados nos PDFs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label>Texto de Introdução (Carta de Apresentação)</Label>
                        <Textarea
                            rows={10}
                            value={formData.introduction_text || ""}
                            onChange={e => setFormData({ ...formData, introduction_text: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Termos Gerais e Rodapé</Label>
                        <Textarea
                            rows={6}
                            value={formData.closing_text || ""}
                            onChange={e => setFormData({ ...formData, closing_text: e.target.value })}
                        />
                    </div>
                </CardContent>
            </Card>
        </form>
    );
}
