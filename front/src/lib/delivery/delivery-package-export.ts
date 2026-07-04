import path from "node:path";
import { buildZipBuffer, type ZipEntry } from "@/lib/budgets/budget-package-zip";
import { getDeliveryEvidenceKindLabel, getDeliveryProjectStatusLabel } from "@/lib/delivery/delivery-status";
import { generateDeliveryDatabookPdfBuffer } from "@/lib/delivery/generate-delivery-databook-pdf-buffer";
import {
    formatEquipmentCsvLine,
    loadDeliveryProjectExportPayload,
} from "@/lib/delivery/delivery-project-export-payload";
import { readUploadFile, safeDownloadFilename, safeZipName } from "@/lib/delivery/delivery-upload-files";
import type {
    DeliveryArea,
    DeliveryChecklistItem,
    DeliveryEvidence,
    DeliveryInstallation,
    DeliveryProject,
} from "@/types/delivery-types";

export type ExportDeliveryPackageResult =
    | { ok: true; buffer: Buffer; filename: string }
    | { ok: false; error: string; status: number };

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function buildIndexHtml(payload: {
    project: DeliveryProject;
    areas: DeliveryArea[];
    evidenceByArea: Map<string, DeliveryEvidence[]>;
    installations: DeliveryInstallation[];
}): string {
    const { project, areas, evidenceByArea, installations } = payload;
    const areaSections = areas
        .map((area) => {
            const checklist = (area.checklist ?? [])
                .map(
                    (item: DeliveryChecklistItem) =>
                        `<li>${item.done ? "✓" : "○"} ${escapeHtml(item.text)}</li>`,
                )
                .join("");
            const evidences = evidenceByArea.get(area.id ?? "") ?? [];
            const evidenceList = evidences
                .map(
                    (ev) =>
                        `<li>${escapeHtml(getDeliveryEvidenceKindLabel(ev.kind))}: ${escapeHtml(ev.filename)}</li>`,
                )
                .join("");
            const areaInstalls = installations.filter((i) => i.delivery_area_id === area.id);
            const installList = areaInstalls
                .map(
                    (ins) =>
                        `<li>${escapeHtml(ins.equipment_code ?? "")} — ${escapeHtml(ins.equipment_description ?? "")} (×${ins.quantity})${ins.tag ? ` TAG: ${escapeHtml(ins.tag)}` : ""}</li>`,
                )
                .join("");

            return `
      <section>
        <h2>${escapeHtml(area.code)} — ${escapeHtml(area.title)}</h2>
        <p><strong>Status:</strong> ${escapeHtml(area.status)}</p>
        ${area.description ? `<p>${escapeHtml(area.description)}</p>` : ""}
        <h3>Checklist</h3>
        <ul>${checklist || "<li>—</li>"}</ul>
        <h3>Evidências</h3>
        <ul>${evidenceList || "<li>Nenhuma</li>"}</ul>
        <h3>Equipamentos instalados</h3>
        <ul>${installList || "<li>Nenhum</li>"}</ul>
      </section>`;
        })
        .join("\n");

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Pacote de Entrega — ${escapeHtml(project.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #111; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    section { margin: 2rem 0; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; }
    h2 { margin-top: 0; color: #1a4d8f; }
    ul { line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Pacote de Entrega Técnica</h1>
  <p><strong>Projeto:</strong> ${escapeHtml(project.title)}</p>
  <p><strong>Status:</strong> ${escapeHtml(getDeliveryProjectStatusLabel(project.status))}</p>
  ${project.contract_ref ? `<p><strong>Referência:</strong> ${escapeHtml(project.contract_ref)}</p>` : ""}
  ${project.budget_code ? `<p><strong>Orçamento:</strong> ${escapeHtml(project.budget_code)}</p>` : ""}
  ${project.client_name ? `<p><strong>Cliente:</strong> ${escapeHtml(project.client_name)}</p>` : ""}
  ${project.databook_template_name ? `<p><strong>DataBook:</strong> ${escapeHtml(project.databook_template_name)}</p>` : ""}
  <p><strong>Gerado em:</strong> ${new Date().toLocaleString("pt-BR")}</p>
  <p><strong>DataBook PDF:</strong> <code>databook/entrega-tecnica.pdf</code></p>
  ${areaSections}
</body>
</html>`;
}

export async function exportDeliveryPackage(projectId: string): Promise<ExportDeliveryPackageResult> {
    const loaded = await loadDeliveryProjectExportPayload(projectId);
    if (!loaded.ok) {
        return { ok: false, error: loaded.error, status: loaded.status };
    }

    const {
        project,
        areas,
        evidenceByArea,
        installations,
        equipmentMap,
        databookReference,
    } = loaded.payload;

    const zipEntries: ZipEntry[] = [];
    zipEntries.push({
        name: "index.html",
        data: Buffer.from(
            buildIndexHtml({ project, areas, evidenceByArea, installations }),
            "utf8",
        ),
    });

    const pdfResult = await generateDeliveryDatabookPdfBuffer(projectId);
    if (pdfResult.ok) {
        zipEntries.push({
            name: "databook/entrega-tecnica.pdf",
            data: pdfResult.buffer,
        });
    }

    for (const area of areas) {
        const areaEvidences = evidenceByArea.get(area.id ?? "") ?? [];
        for (let i = 0; i < areaEvidences.length; i++) {
            const ev = areaEvidences[i];
            const bytes = await readUploadFile(ev.url);
            if (!bytes) continue;
            const ext = path.extname(ev.filename) || path.extname(ev.url) || ".bin";
            zipEntries.push({
                name: `evidencias/${safeZipName(area.code)}/${String(i + 1).padStart(2, "0")}_${safeZipName(ev.kind)}${ext}`,
                data: bytes,
            });
        }
    }

    const manualsAdded = new Set<string>();
    for (const ins of installations) {
        if (!ins.include_manual_in_export) continue;
        const eq = equipmentMap.get(ins.technical_equipment_id);
        if (!eq) continue;
        const manual = eq.manual_file as Record<string, unknown> | undefined;
        if (!manual?.url) continue;
        const url = String(manual.url);
        if (manualsAdded.has(url)) continue;
        manualsAdded.add(url);
        const bytes = await readUploadFile(url);
        if (!bytes) continue;
        const filename = manual.filename ? String(manual.filename) : "manual.pdf";
        zipEntries.push({
            name: `manuais/${safeZipName(ins.equipment_code ?? ins.technical_equipment_id)}_${safeZipName(filename)}`,
            data: bytes,
        });
    }

    const equipListLines = [...equipmentMap.entries()].map(([id, eq]) =>
        formatEquipmentCsvLine(id, eq),
    );
    zipEntries.push({
        name: "equipamentos.csv",
        data: Buffer.from(
            "codigo;fabricante;modelo;categoria\n" + equipListLines.join("\n"),
            "utf8",
        ),
    });

    if (databookReference?.url) {
        const refBytes = await readUploadFile(databookReference.url);
        if (refBytes) {
            const refName = databookReference.filename ?? "memorial-referencia.pdf";
            zipEntries.push({
                name: `referencia/${safeZipName(refName)}`,
                data: refBytes,
            });
        }
    }

    const buffer = buildZipBuffer(zipEntries);
    const slug = safeDownloadFilename(project.title || projectId, 40);
    return {
        ok: true,
        buffer,
        filename: `entrega-${slug}.zip`,
    };
}
