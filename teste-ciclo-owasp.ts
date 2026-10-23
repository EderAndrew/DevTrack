export function calcularMedia(valores: readonly number[]): number {
  if (!Array.isArray(valores)) {
    throw new TypeError('calcularMedia espera um array de números.');
  }
  if (valores.length === 0) {
    throw new RangeError('calcularMedia não aceita array vazio.');
  }

  let soma = 0;
  for (const [indice, valor] of valores.entries()) {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new TypeError(`Valor inválido na posição ${indice}: esperado número finito.`);
    }
    soma += valor;
  }

  const media = soma / valores.length;
  if (!Number.isFinite(media)) {
    throw new RangeError('A soma dos valores excede o intervalo representável.');
  }
  return media;
}
