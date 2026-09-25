import { GROUPS, REGISTRY } from "../registry";

/**
 * The visual catalog (005 FR-031, research V14): an index by group, then one section per entry
 * of the registry with its name, its source file and its showcase. Fixed sample data only.
 */
export function Catalog() {
  return (
    <>
      <nav aria-label="Índice do catálogo" className="mb-10">
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
          {GROUPS.map((group) => (
            <li key={group.id}>
              <a href={`#${group.id}`}>{group.name}</a>
            </li>
          ))}
        </ul>
      </nav>
      {GROUPS.map((group) => (
        <section key={group.id} id={group.id} aria-labelledby={`${group.id}-titulo`} className="mb-16">
          <h2 id={`${group.id}-titulo`} className="m-0 mb-6 border-b border-border pb-2 text-h2">
            {group.name}
          </h2>
          <div className="flex flex-col gap-12">
            {REGISTRY.filter((entry) => entry.group === group.id).map(({ id, name, source, showcase: Showcase }) => (
              <section key={id} id={id} aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h3 id={`${id}-titulo`} className="m-0 text-h3">
                    {name}
                  </h3>
                  <p className="m-0 text-caption text-text-secondary">
                    <code>{source}</code>
                  </p>
                </div>
                <Showcase />
              </section>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
