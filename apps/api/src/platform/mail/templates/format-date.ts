const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** A deadline as people in the school read it (Brasília time). */
export const formatDate = (date: Date) => dateFormat.format(date);
