# assets

## common-passwords.txt

Lista das 10 000 senhas mais comuns usada pela `PasswordPolicy` (FR-011, R4).

- Origem: [SecLists](https://github.com/danielmiessler/SecLists) —
  `Passwords/Common-Credentials/10k-most-common.txt` (branch `master`, baixado em 2026-09-21).
- Licença: MIT (SecLists, © Daniel Miessler).
- SHA-256: `68782d6a4a19a4768d5f15dd66bd534e7a33055cc755411e33f16d18c50fdcce`.

A comparação é feita sem distinção de maiúsculas/minúsculas. Para atualizar a lista,
substitua o arquivo e atualize o checksum acima.

## common-words-pt-br.txt

Palavras que a lista acima não cobre e que tendem a aparecer em senhas no Brasil: nomes, times,
cidades, família, religião e o nome do produto. Só a regra do aceite de convite usa (FR-011a).

- Origem: seleção manual do projeto, não uma lista de vazamentos; não pretende ser completa.
- Formato: uma palavra por linha, em ordem, só letras minúsculas sem acento (nomes compostos sem
  espaço: `saopaulo`).

Para atualizar, edite o arquivo mantendo esse formato; o teste de `PasswordPolicy` o verifica.
