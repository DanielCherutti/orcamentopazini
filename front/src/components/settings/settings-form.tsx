"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
    ProposalSettings,
    testImapConnectionAction,
    updateProposalSettingsAction,
} from "@/actions/settings-actions";
import { BrandAssetUploadField } from "@/components/platform/brand-asset-upload-field";
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
    const [imapPassNew, setImapPassNew] = useState("");
    const [imapTesting, setImapTesting] = useState(false);
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
                imap_pass_new: imapPassNew.trim() || undefined,
            });
            if (res.success) {
                toast.success("Configurações salvas!");
                setSmtpPassNew("");
                setImapPassNew("");
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

    const handleTestImap = async () => {
        setImapTesting(true);
        try {
            const res = await testImapConnectionAction();
            if (res.success) {
                toast.success(
                    `IMAP conectado (${res.imapUser ?? "conta"} em ${res.imapHost ?? "servidor"}).`
                );
            } else {
                toast.error(res.error || "Falha ao conectar no IMAP.");
            }
        } catch {
            toast.error("Erro ao testar IMAP.");
        } finally {
            setImapTesting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6 pb-10">
            <div className="flex justify-end">
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
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nome da Empresa (Exibição)</Label>
                            <Input
                                value={formData.company_name || ""}
                                onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                            />
                        </div>
                        <BrandAssetUploadField
                            id="settings-logo"
                            label="Logo"
                            value={formData.company_logo_url || ""}
                            onChange={(url) =>
                                setFormData({ ...formData, company_logo_url: url })
                            }
                            asset="logo"
                            uploadUrl="/api/upload/library"
                            hint="JPG, PNG, GIF ou WEBP (até 5 MB). Salve após o upload."
                        />
                        <BrandAssetUploadField
                            id="settings-favicon"
                            label="Favicon (opcional)"
                            value={formData.company_favicon_url || ""}
                            onChange={(url) =>
                                setFormData({ ...formData, company_favicon_url: url })
                            }
                            asset="favicon"
                            uploadUrl="/api/upload/library"
                            hint="PNG ou ICO (até 512 KB). Ícone da aba do navegador."
                        />
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

            {/* Dados usados pelo PDF; liga/desliga e layout ficam no compositor. */}
            <Card>
                <CardHeader>
                    <CardTitle>Dados da empresa para o PDF</CardTitle>
                    <CardDescription>
                        Nome, logo, subtítulo e contatos que podem ser usados pelo bloco{" "}
                        <strong>Cabeçalho e Rodapé</strong> do compositor. A ativação, layout e escopo do
                        cabeçalho/rodapé ficam centralizados no compositor.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                        E-mail (convites e orçamentos)
                    </CardTitle>
                    <CardDescription>
                        O envio usa SMTP. A aba E-mail do orçamento busca respostas via IMAP na mesma conta
                        (ou nos campos IMAP abaixo).
                    </CardDescription>
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
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="smtp_reply_to">Reply-To (receber respostas)</Label>
                            <Input
                                id="smtp_reply_to"
                                type="email"
                                autoComplete="off"
                                value={formData.smtp_reply_to || ""}
                                onChange={(e) =>
                                    setFormData({ ...formData, smtp_reply_to: e.target.value })
                                }
                                placeholder="ex.: comercial@engenhariapazini.com.br (evite no-reply)"
                            />
                            <p className="text-xs text-muted-foreground">
                                Quando o cliente clica em Responder, o Gmail envia para este endereço.
                                Configure o IMAP com a mesma caixa (ou usuário com acesso a ela).
                            </p>
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
                    <div className="border-t pt-4 space-y-4">
                        <p className="text-sm font-medium">IMAP (opcional — buscar respostas)</p>
                        <p className="text-xs text-muted-foreground">
                            Deixe em branco para usar o mesmo servidor/usuário/senha do SMTP. Gmail:
                            ative IMAP e use senha de aplicativo. Microsoft 365: IMAP precisa estar
                            liberado no tenant.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="imap_host">Servidor IMAP</Label>
                                <Input
                                    id="imap_host"
                                    value={formData.imap_host || ""}
                                    onChange={(e) =>
                                        setFormData({ ...formData, imap_host: e.target.value })
                                    }
                                    placeholder="imap.gmail.com (automático se vazio)"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="imap_user">Usuário IMAP</Label>
                                <Input
                                    id="imap_user"
                                    type="email"
                                    autoComplete="off"
                                    value={formData.imap_user || ""}
                                    onChange={(e) =>
                                        setFormData({ ...formData, imap_user: e.target.value })
                                    }
                                    placeholder="e-mail completo (automático se vazio)"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="imap_pass_new">Senha IMAP</Label>
                            <Input
                                id="imap_pass_new"
                                type="password"
                                autoComplete="new-password"
                                value={imapPassNew}
                                onChange={(e) => setImapPassNew(e.target.value)}
                                placeholder={
                                    formData.imap_pass_configured
                                        ? "Deixe em branco para manter"
                                        : "Senha de aplicativo (se diferente do SMTP)"
                                }
                            />
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={imapTesting}
                            onClick={handleTestImap}
                        >
                            {imapTesting ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Testar conexão IMAP
                        </Button>
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
