"use client";

import { useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { TechnicalEquipmentFileUpload } from "@/components/technical-equipment/technical-equipment-file-upload";
import { TECHNICAL_EQUIPMENT_CATEGORIES } from "@/lib/technical-equipment/categories";
import type {
    TechnicalEquipment,
    TechnicalEquipmentCategory,
    TechnicalEquipmentFile,
} from "@/types/technical-equipment-types";

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} className="min-w-[140px]">
            {pending ? (
                <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Salvando...
                </>
            ) : isEditing ? (
                "Salvar alterações"
            ) : (
                "Salvar equipamento"
            )}
        </Button>
    );
}

interface TechnicalEquipmentFormProps {
    initialData?: TechnicalEquipment;
    defaultCode?: string;
    action: (formData: FormData) => Promise<void>;
    generalError?: string;
}

export function TechnicalEquipmentForm({
    initialData,
    defaultCode,
    action,
    generalError,
}: TechnicalEquipmentFormProps) {
    const [code, setCode] = useState(initialData?.code || defaultCode || "");
    const [manufacturer, setManufacturer] = useState(initialData?.manufacturer || "");
    const [model, setModel] = useState(initialData?.model || "");
    const [description, setDescription] = useState(initialData?.description || "");
    const [category, setCategory] = useState(initialData?.category || "outro");
    const [norms, setNorms] = useState((initialData?.norms ?? []).join(", "));
    const [capacityKn, setCapacityKn] = useState(
        initialData?.capacity_kn != null ? String(initialData.capacity_kn) : "",
    );
    const [usersCapacity, setUsersCapacity] = useState(
        initialData?.users_capacity != null ? String(initialData.users_capacity) : "",
    );
    const [notes, setNotes] = useState(initialData?.notes || "");
    const [manualFile, setManualFile] = useState<TechnicalEquipmentFile | null>(
        initialData?.manual_file ?? null,
    );
    const [datasheetFile, setDatasheetFile] = useState<TechnicalEquipmentFile | null>(
        initialData?.datasheet_file ?? null,
    );
    const [certificateFile, setCertificateFile] = useState<TechnicalEquipmentFile | null>(
        initialData?.certificate_file ?? null,
    );

    useEffect(() => {
        if (defaultCode && !initialData?.id && !code) setCode(defaultCode);
    }, [defaultCode, initialData?.id, code]);

    const equipmentId = initialData?.id;

    const handleSubmit = async (formData: FormData) => {
        formData.set("code", code);
        formData.set("manufacturer", manufacturer);
        formData.set("model", model);
        formData.set("description", description);
        formData.set("category", category);
        formData.set(
            "norms",
            JSON.stringify(
                norms
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
            ),
        );
        formData.set("capacity_kn", capacityKn);
        formData.set("users_capacity", usersCapacity);
        formData.set("notes", notes);
        formData.set("manual_file", manualFile ? JSON.stringify(manualFile) : "");
        formData.set("datasheet_file", datasheetFile ? JSON.stringify(datasheetFile) : "");
        formData.set("certificate_file", certificateFile ? JSON.stringify(certificateFile) : "");
        formData.set("active", "true");
        await action(formData);
    };

    return (
        <form action={handleSubmit}>
            {generalError ? (
                <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{generalError}</AlertDescription>
                </Alert>
            ) : null}

            <Tabs defaultValue="basic" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="basic">Identificação</TabsTrigger>
                    <TabsTrigger value="docs">Manual e documentos</TabsTrigger>
                    <TabsTrigger value="specs">Especificações</TabsTrigger>
                </TabsList>

                <TabsContent value="basic">
                    <Card>
                        <CardContent className="pt-6 grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="code">Código</Label>
                                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label>Categoria</Label>
                                <Select
                                    value={category}
                                    onValueChange={(v) =>
                                        setCategory(v as TechnicalEquipmentCategory)
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TECHNICAL_EQUIPMENT_CATEGORIES.map((c) => (
                                            <SelectItem key={c.value} value={c.value}>
                                                {c.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="manufacturer">Fabricante</Label>
                                <Input
                                    id="manufacturer"
                                    value={manufacturer}
                                    onChange={(e) => setManufacturer(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="model">Modelo</Label>
                                <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} required />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="description">Descrição</Label>
                                <Input
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    required
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="docs">
                    <Card>
                        <CardContent className="pt-6 space-y-6">
                            <TechnicalEquipmentFileUpload
                                equipmentId={equipmentId}
                                label="Manual do produto"
                                description="PDF do fabricante — incluído automaticamente no pacote de entrega"
                                required
                                kind="manual"
                                file={manualFile}
                                onChange={setManualFile}
                            />
                            <TechnicalEquipmentFileUpload
                                equipmentId={equipmentId}
                                label="Ficha técnica"
                                kind="datasheet"
                                file={datasheetFile}
                                onChange={setDatasheetFile}
                            />
                            <TechnicalEquipmentFileUpload
                                equipmentId={equipmentId}
                                label="Certificado"
                                kind="certificate"
                                file={certificateFile}
                                onChange={setCertificateFile}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="specs">
                    <Card>
                        <CardContent className="pt-6 grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="norms">Normas (separadas por vírgula)</Label>
                                <Input
                                    id="norms"
                                    value={norms}
                                    onChange={(e) => setNorms(e.target.value)}
                                    placeholder="NR-35, ABNT NBR 16325"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="capacity_kn">Capacidade (kN)</Label>
                                <Input
                                    id="capacity_kn"
                                    type="number"
                                    step="0.01"
                                    value={capacityKn}
                                    onChange={(e) => setCapacityKn(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="users_capacity">Nº de usuários</Label>
                                <Input
                                    id="users_capacity"
                                    type="number"
                                    min={1}
                                    value={usersCapacity}
                                    onChange={(e) => setUsersCapacity(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="notes">Observações</Label>
                                <Textarea
                                    id="notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={4}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <div className="flex justify-end pt-4">
                <SubmitButton isEditing={Boolean(equipmentId)} />
            </div>
        </form>
    );
}
