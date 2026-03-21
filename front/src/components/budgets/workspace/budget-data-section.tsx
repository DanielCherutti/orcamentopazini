"use client";

import { Budget } from "@/types/budget-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ClientSelector } from "@/components/clients/client-selector";
import type { Client } from "@/actions/client-actions";
import { useState, useEffect } from "react";
import { getCustomerAction } from "@/actions/client-actions";

interface BudgetDataSectionProps {
    budget: Budget;
    onUpdate: (updates: Partial<Budget>) => void;
    isEditable?: boolean;
}

/**
 * Seção editável de dados principais do orçamento.
 * Inclui: Cliente, Número, Datas, Condições Comerciais, Descrição.
 */
/**
 * Extrai o ID string de um client_id que pode ser objeto (via FETCH SurrealDB) ou string.
 */
function extractClientId(clientId: unknown): string {
    if (!clientId) return "";
    if (typeof clientId === "object" && clientId !== null && "id" in clientId) {
        return String((clientId as Record<string, unknown>).id);
    }
    return String(clientId);
}

export function BudgetDataSection({
    budget,
    onUpdate,
    isEditable = true
}: BudgetDataSectionProps) {

    const [clientDetails, setClientDetails] = useState<string>("");
    const [currentClientId, setCurrentClientId] = useState<string>(extractClientId(budget.client_id));

    const handleClientSelect = (clientId: string, client?: Client) => {
        console.log("handleClientSelect - clientId:", clientId, "client:", client);
        // Normaliza para garantir que só o ID string vá para o banco
        const normalizedId = extractClientId(clientId);
        onUpdate({ client_id: normalizedId });
        setCurrentClientId(normalizedId);

        if (client) {
            const details = [client.name, client.city, client.cnpj]
                .filter(Boolean)
                .join(" - ");
            setClientDetails(details);
        }
    };

    useEffect(() => {
        const normalizedId = extractClientId(budget.client_id);
        setCurrentClientId(normalizedId);
        // Não limpa clientDetails — será recarregado pelo effect abaixo
    }, [budget.client_id]);

    // Carrega nome/cidade/CNPJ do cliente sempre que o ID mudar
    useEffect(() => {
        if (!currentClientId) {
            setClientDetails("");
            return;
        }
        // Só busca se não temos detalhes (evita chamada dupla na seleção manual)
        if (clientDetails) return;

        getCustomerAction(currentClientId).then((result) => {
            if (result.success && result.data) {
                const { name, city, cnpj } = result.data;
                setClientDetails([name, city, cnpj].filter(Boolean).join(" - "));
            }
        });
    }, [currentClientId]); // eslint-disable-line react-hooks/exhaustive-deps

    const formatDate = (date: string | undefined) => {
        if (!date) return new Date().toISOString().split('T')[0];
        return new Date(date).toISOString().split('T')[0];
    };

    return (
        <div className="space-y-6">
            {/* Card 1: Dados Principais */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Dados Principais
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    {/* Título da Proposta */}
                    <div className="space-y-2">
                        <Label htmlFor="budget-title">Título da Proposta</Label>
                        <Input
                            id="budget-title"
                            value={budget.title || budget.code || ""}
                            onChange={(e) => onUpdate({ title: e.target.value })}
                            disabled={!isEditable}
                            placeholder="Ex: Proposta Comercial - 00001"
                        />
                        {budget.code && (
                            <p className="text-xs text-muted-foreground">
                                Nº {budget.code}
                            </p>
                        )}
                    </div>

                    {/* Cliente */}
                    <div className="space-y-2">
                        <Label htmlFor="budget-client">Cliente</Label>
                        <ClientSelector
                            value={currentClientId}
                            onSelect={(clientId) => handleClientSelect(clientId)}
                            onClientSelect={(client) => {
                                if (client) {
                                    handleClientSelect(client.id, client);
                                }
                            }}
                            error={false}
                        />
                        {clientDetails && (
                            <p className="text-xs text-muted-foreground">
                                {clientDetails}
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Card 2: Condições Comerciais */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Condições Comerciais
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-3">
                    {/* Número da seção raiz */}
                    <div className="space-y-2">
                        <Label htmlFor="section-number">Seção do Orçamento (nº raiz)</Label>
                        <Input
                            id="section-number"
                            type="number"
                            min="1"
                            value={budget.section_number ?? 1}
                            onChange={(e) => onUpdate({ section_number: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-24"
                            disabled={!isEditable}
                        />
                        <p className="text-xs text-muted-foreground">
                            Locais serão numerados {budget.section_number ?? 1}.1, {budget.section_number ?? 1}.2…
                        </p>
                    </div>

                    {/* Data de Emissão */}
                    <div className="space-y-2">
                        <Label htmlFor="issue-date">Data de Emissão</Label>
                        <Input
                            id="issue-date"
                            type="date"
                            value={formatDate(budget.issue_date || budget.created_at)}
                            onChange={(e) => onUpdate({ issue_date: e.target.value })}
                            disabled={!isEditable}
                        />
                    </div>

                    {/* Validade */}
                    <div className="space-y-2">
                        <Label htmlFor="validity">Validade da Proposta</Label>
                        <div className="flex gap-2">
                            <Input
                                id="validity"
                                type="number"
                                min="1"
                                value={budget.validity_days || 15}
                                onChange={(e) => onUpdate({ validity_days: parseInt(e.target.value) || 15 })}
                                className="w-20"
                                disabled={!isEditable}
                            />
                            <Select value="days" disabled>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="days">Dias</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Prazo de Entrega */}
                    <div className="space-y-2">
                        <Label htmlFor="delivery-time">Prazo de Entrega</Label>
                        <Input
                            id="delivery-time"
                            placeholder="Ex: 10 dias úteis"
                            value={budget.delivery_time || "10 dias úteis após aprovação"}
                            onChange={(e) => onUpdate({ delivery_time: e.target.value })}
                            disabled={!isEditable}
                        />
                    </div>

                    {/* Condições de Pagamento */}
                    <div className="col-span-3 space-y-2">
                        <Label htmlFor="payment-terms">Condições de Pagamento</Label>
                        <Select
                            value={budget.payment_terms || "30/60/90 dias"}
                            onValueChange={(value) => onUpdate({ payment_terms: value })}
                            disabled={!isEditable}
                        >
                            <SelectTrigger id="payment-terms">
                                <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="À Vista (5% desc)">À Vista (5% desc)</SelectItem>
                                <SelectItem value="30 dias">30 dias</SelectItem>
                                <SelectItem value="30/60 dias">30/60 dias</SelectItem>
                                <SelectItem value="30/60/90 dias">30/60/90 dias</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Card 3: Descrição / Objeto */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Detalhamento / Objeto
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição Inicial</Label>
                        <Textarea
                            id="description"
                            className="min-h-[120px]"
                            placeholder="Descreva o escopo geral do serviço ou detalhes importantes que devem aparecer na capa da proposta..."
                            value={budget.description || ""}
                            onChange={(e) => onUpdate({ description: e.target.value })}
                            disabled={!isEditable}
                        />
                        <p className="text-xs text-muted-foreground">
                            Esta descrição aparecerá na introdução do PDF.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
