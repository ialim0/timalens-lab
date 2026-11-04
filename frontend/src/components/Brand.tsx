/** The TimaLens logo (light and dark), with the "Lab" tag; it leads home. */
export function Brand() {
  return (
    <a className="brand" href="/">
      <picture>
        <source srcSet="/img/timalens-logo-dark.png" media="(prefers-color-scheme: dark)" />
        <img src="/img/timalens-logo.png" alt="TimaLens" width={168} height={28} />
      </picture>
      <span className="brand-lab">Lab</span>
    </a>
  );
}
