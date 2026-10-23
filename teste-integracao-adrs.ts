export function validarQuantidade(valor: number): boolean {
  // Number.isInteger already rejects NaN, Infinity and -Infinity.
  return typeof valor === "number" && Number.isInteger(valor) && valor > 0;
}
