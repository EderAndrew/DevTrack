import { describe, expect, it, vi } from "vitest";
import { ApiError, NETWORK_ERROR } from "../api/client";
import { makeQueryClient } from "./query-client";

const unauthenticated = () => new ApiError(401, "UNAUTHENTICATED", "Sessão inválida");

describe("002/US4-4 cache descartado quando a API recusa a sessão (FR-024)", () => {
  const setup = () => {
    const navigate = vi.fn<(url: string) => void>();
    const client = makeQueryClient({ navigate, currentPath: () => "/admin/managers?x=1" });
    client.setQueryData(["managers", "list"], { items: ["dados da sessão anterior"] });
    return { client, navigate };
  };

  it("401 numa query limpa o cache e leva a /entrar?next=<rota>", async () => {
    const { client, navigate } = setup();
    await expect(
      client.fetchQuery({ queryKey: ["accounts", "list"], queryFn: () => Promise.reject(unauthenticated()) }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(client.getQueryData(["managers", "list"])).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(navigate).toHaveBeenCalledWith("/entrar?next=%2Fadmin%2Fmanagers%3Fx%3D1");
  });

  it("401 numa mutação limpa o cache e leva a /entrar?next=<rota>", async () => {
    const { client, navigate } = setup();
    const mutation = client.getMutationCache().build(client, { mutationFn: () => Promise.reject(unauthenticated()) });
    await expect(mutation.execute(undefined)).rejects.toBeInstanceOf(ApiError);

    expect(client.getQueryData(["managers", "list"])).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith("/entrar?next=%2Fadmin%2Fmanagers%3Fx%3D1");
  });

  it("fluxos públicos que respondem 401 como resultado (login, SIGN_IN_REQUIRED) não saem da tela", async () => {
    const { client, navigate } = setup();
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(new ApiError(401, "INVALID_CREDENTIALS", "x")),
      meta: { authRedirect: false },
    });
    await expect(mutation.execute(undefined)).rejects.toBeInstanceOf(ApiError);

    expect(navigate).not.toHaveBeenCalled();
    expect(client.getQueryData(["managers", "list"])).toBeDefined();
  });

  it("outros erros da API não limpam o cache", async () => {
    const { client, navigate } = setup();
    await expect(
      client.fetchQuery({
        queryKey: ["accounts", "list"],
        queryFn: () => Promise.reject(new ApiError(403, "FORBIDDEN", "x")),
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(navigate).not.toHaveBeenCalled();
    expect(client.getQueryData(["managers", "list"])).toBeDefined();
  });
});

describe("002/US4-4 retry só para falha de rede", () => {
  const client = () => makeQueryClient({ navigate: vi.fn(), retryDelay: 0 });

  it("NETWORK_ERROR é repetido até 2 vezes", async () => {
    const queryFn = vi.fn(() => Promise.reject(new ApiError(0, NETWORK_ERROR, "Network request failed")));
    await expect(client().fetchQuery({ queryKey: ["x"], queryFn })).rejects.toBeInstanceOf(ApiError);
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it.each([
    [400, "VALIDATION_ERROR"],
    [404, "NOT_FOUND"],
    [409, "INVALID_STATE_TRANSITION"],
    [500, "INTERNAL_ERROR"],
  ])("resposta da API %i %s não é repetida", async (status, code) => {
    const queryFn = vi.fn(() => Promise.reject(new ApiError(status, code, "x")));
    await expect(client().fetchQuery({ queryKey: ["x"], queryFn })).rejects.toBeInstanceOf(ApiError);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("mutações nunca são repetidas (a requisição pode ter chegado à API)", async () => {
    const c = client();
    const mutationFn = vi.fn(() => Promise.reject(new ApiError(0, NETWORK_ERROR, "Network request failed")));
    await expect(c.getMutationCache().build(c, { mutationFn }).execute(undefined)).rejects.toBeInstanceOf(ApiError);
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it("padrões: staleTime de 30 s e sem refetch ao focar a janela", () => {
    const defaults = client().getDefaultOptions().queries;
    expect(defaults?.staleTime).toBe(30_000);
    expect(defaults?.refetchOnWindowFocus).toBe(false);
  });
});
