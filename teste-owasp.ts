export function somar(a: number, b: number): number {
  return a + b;
}

export function subtrair(a: number, b: number): number {
  return a - b;
}

export function multiplicar(a: number, b: number): number {
  return a * b;
}

export function dividir(a: number, b: number): number {
  if (b === 0) {
    throw new RangeError("Divisão por zero não é permitida.");
  }
  return a / b;
}

export function calcularResto(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new RangeError("Os parâmetros devem ser números finitos.");
  }
  if (b === 0) {
    throw new RangeError("Divisão por zero não é permitida.");
  }
  return a % b;
}

export function calcularQuadrado(a: number): number {
  if (!Number.isFinite(a)) {
    throw new RangeError("O parâmetro deve ser um número finito.");
  }
  return a * a;
}

export function calcularTriplo(a: number): number {
  if (!Number.isFinite(a)) {
    throw new RangeError("O parâmetro deve ser um número finito.");
  }
  return a * 3;
}

export function calcularMetade(a: number): number {
  if (!Number.isFinite(a)) {
    throw new RangeError("O parâmetro deve ser um número finito.");
  }
  return a / 2;
}
