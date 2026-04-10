"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { Loader2, Mail, Upload } from "lucide-react";

export function SettingsForm({ initialSettings }: { initialSettings: ProposalSettings }) {
    const router = useRouter();
    const [formData, setFormData] = useState(initialSettings);
    const [smtpPassNew, setSmtpPassNew] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [logoUploading, setLogoUploading] = useState(false);
    const logoFileInputRef = useRef<HTMLInputElement>(null);

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

    const handleLogoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setLogoUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload/library", { method: "POST", body: fd });
            const json = (await res.json()) as { url?: string; error?: string };
            if (!res.ok || !json.url) {
                toast.error(json.error || "Falha ao enviar a imagem");
                return;
            }
            setFormData((prev) => ({ ...prev, company_logo_url: json.url }));
            toast.success("Logo enviado. Clique em Salvar para aplicar.");
        } catch {
            toast.error("Erro ao enviar a imagem");
        } finally {
            setLogoUploading(false);
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
                            <Label>Logo</Label>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Input
                                    className="sm:flex-1"
                                    value={formData.company_logo_url || ""}
                                    onChange={e =>
                                        setFormData({ ...formData, company_logo_url: e.target.value })
                                    }
                                    placeholder="https://... ou envie um arquivo"
                                />
                                <input
                                    ref={logoFileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    className="sr-only"
                                    onChange={handleLogoFileSelected}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0"
                                    disabled={logoUploading}
                                    onClick={() => logoFileInputRef.current?.click()}
                                >
                                    {logoUploading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Enviando…
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-4 w-4 mr-2" />
                                            Enviar imagem
                                        </>
                                    )}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Cole uma URL pública, use Data URI, ou envie JPG, PNG, GIF ou WEBP (até 5&nbsp;MB). Salve
                                as alterações após o upload.
                            </p>
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

            {/* Cabeçalho do PDF */}
            <Card>
                <CardHeader>
                    <CardTitle>Cabeçalho das propostas (PDF)</CardTitle>
                    <CardDescription>
                        Layout em duas colunas: marca à esquerda e contatos à direita — como no modelo comercial. Usa a{" "}
                        <strong>cor primária</strong> acima.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
                        <Checkbox
                            id="pdf_header_fill_from_settings"
                            checked={formData.pdf_header_fill_from_settings === true}
                            onCheckedChange={(c) =>
                                setFormData({
                                    ...formData,
                                    pdf_header_fill_from_settings: c === true,
                                })
                            }
                        />
                        <div className="space-y-1">
                            <Label htmlFor="pdf_header_fill_from_settings" className="cursor-pointer text-sm font-medium">
                                Usar estes dados no cabeçalho do PDF
                            </Label>
                            <p className="text-xs text-muted-foreground leading-snug">
                                Desligado, o cabeçalho das propostas fica em branco (até você ativar). Você ainda pode
                                definir substituições só na capa, no compositor.
                            </p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Linha abaixo do nome (opcional)</Label>
                        <Input
                            value={formData.company_header_subtitle || ""}
                            onChange={(e) =>
                                setFormData({ ...formData, company_header_subtitle: e.target.value })
                            }
                        />
                        <p className="text-xs text-muted-foreground">
                            Aparece em fonte menor, abaixo do nome da empresa (ex.: segunda linha da marca).
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>WhatsApp</Label>
                            <Input
                                value={formData.pdf_contact_whatsapp || ""}
                                onChange={(e) =>
                                    setFormData({ ...formData, pdf_contact_whatsapp: e.target.value })
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Facebook / rede</Label>
                            <Input
                                value={formData.pdf_contact_facebook || ""}
                                onChange={(e) =>
                                    setFormData({ ...formData, pdf_contact_facebook: e.target.value })
                                }
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>E-mail</Label>
                            <Input
                                type="email"
                                value={formData.pdf_contact_email || ""}
                                onChange={(e) =>
                                    setFormData({ ...formData, pdf_contact_email: e.target.value })
                                }
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>Site</Label>
                            <Input
                                value={formData.pdf_contact_website || ""}
                                onChange={(e) =>
                                    setFormData({ ...formData, pdf_contact_website: e.target.value })
                                }
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>Local / cidade</Label>
                            <Input
                                value={formData.pdf_contact_location || ""}
                                onChange={(e) =>
                                    setFormData({ ...formData, pdf_contact_location: e.target.value })
                                }
                            />
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
