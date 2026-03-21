"use client";

import { useState } from "react";
import { ProposalSettings, updateProposalSettingsAction } from "@/actions/settings-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/lib/toast";
import { Loader2 } from "lucide-react";

export function SettingsForm({ initialSettings }: { initialSettings: ProposalSettings }) {
    const [formData, setFormData] = useState(initialSettings);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await updateProposalSettingsAction(formData);
            if (res.success) {
                toast.success("Configurações salvas!");
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
                    <p className="text-muted-foreground">Personalize a identidade visual e textos das suas propostas.</p>
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
                    <CardDescription>Defina como sua marca aparece nas propostas.</CardDescription>
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
