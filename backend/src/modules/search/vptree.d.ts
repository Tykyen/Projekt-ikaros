declare module 'vptree' {
  interface VPTree<T> {
    search(query: T, count: number): Array<{ i: number; d: number }>;
  }

  function build<T>(points: T[], distanceFunction: (a: T, b: T) => number): VPTree<T>;

  export = { build };
}
