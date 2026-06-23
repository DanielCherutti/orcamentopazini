import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplateVariableContext,
  renderTemplateVariables,
} from "@/lib/model-variables";

test("renderTemplateVariables replaces required customer and budget variables", () => {
  const context = buildTemplateVariableContext({
    customer: {
      id: "client:1",
      name: "Pazini Engenharia Ltda",
      razao_social: "Pazini Engenharia Ltda",
      nome_fantasia: "Pazini",
      cnpj: "12.345.678/0001-90",
      logo_url: "/api/uploads/customers/pazini/logos/logo.png",
      address: {
        street: "Rua A",
        number: "123",
        city: "Ponta Grossa",
        state: "PR",
      },
      informacoes_adicionais: {
        inscricao_estadual: "ISENTO",
      },
    },
    budget: {
      code: "00042",
    },
  });

  const rendered = renderTemplateVariables(
    "{{cliente.razao_social}} / {{cliente.nome_fantasia}} / {{cliente.cnpj}} / {{orcamento.codigo}} / {{cliente.adicional.inscricao_estadual}} / {{cliente.logo}}",
    context,
  );

  assert.match(rendered, /Pazini Engenharia Ltda/);
  assert.match(rendered, /Pazini/);
  assert.match(rendered, /12\.345\.678\/0001-90/);
  assert.match(rendered, /00042/);
  assert.match(rendered, /ISENTO/);
  assert.match(rendered, /<img src="\/api\/uploads\/customers\/pazini\/logos\/logo\.png"/);
});

test("renderTemplateVariables returns empty strings for missing and null values", () => {
  const rendered = renderTemplateVariables(
    "A{{cliente.razao_social}}B{{cliente.adicional.nao_existe}}C{{orcamento.codigo}}D",
    { cliente: { adicional: {} }, orcamento: {} },
  );

  assert.equal(rendered, "ABCD");
});

