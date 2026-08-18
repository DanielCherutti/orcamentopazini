import assert from "node:assert/strict";
import test from "node:test";
import { clientMatchesSearch, normalizeClientSearch } from "@/lib/clients/client-search";

test("filters clients safely when optional database fields are empty", () => {
  const client = {
    name: "Administrador Ltda",
    cnpj: null,
    city: undefined,
    email: null,
    nome_fantasia: null,
    address: null,
  };

  assert.equal(clientMatchesSearch(client, normalizeClientSearch("adm")), true);
  assert.equal(clientMatchesSearch(client, normalizeClientSearch("inexistente")), false);
});

test("client search ignores accents and includes nested city and corporate names", () => {
  const client = {
    name: "Indústria São José",
    razao_social: "Companhia de Administração",
    address: { city: "Iraí" },
  };

  assert.equal(clientMatchesSearch(client, normalizeClientSearch("industria")), true);
  assert.equal(clientMatchesSearch(client, normalizeClientSearch("administracao")), true);
  assert.equal(clientMatchesSearch(client, normalizeClientSearch("irai")), true);
});
