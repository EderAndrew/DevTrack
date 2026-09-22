const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** ISO date of the contract (002 S4) as shown on every screen: short date and time in Brasília. */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
