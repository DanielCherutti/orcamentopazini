export function normalizeClientSearch(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function clientMatchesSearch(
  client: Record<string, unknown>,
  normalizedSearch: string,
): boolean {
  if (!normalizedSearch) return true;

  const address =
    client.address && typeof client.address === "object" && !Array.isArray(client.address)
      ? (client.address as Record<string, unknown>)
      : {};
  const haystack = normalizeClientSearch(
    [
      client.name,
      client.razao_social,
      client.nome_fantasia,
      client.email,
      client.city,
      client.cnpj,
      address.city,
    ]
      .filter((part) => part != null && String(part).trim() !== "")
      .join(" "),
  );

  return haystack.includes(normalizedSearch);
}
