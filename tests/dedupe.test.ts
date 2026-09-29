import { selectBestOffers } from '../src/domain/dedupe';

const h = (name: string, price: number, commissionPct = 10) => ({ name, price, commissionPct });

describe('selectBestOffers', () => {
  it('picks Supplier A when A is cheaper on overlap', () => {
    const r = selectBestOffers([h('X', 100)], [h('X', 120)]);
    expect(r).toEqual([{ name: 'X', price: 100, supplier: 'Supplier A', commissionPct: 10 }]);
  });

  it('picks Supplier B when B is cheaper on overlap', () => {
    const r = selectBestOffers([h('X', 130)], [h('X', 120, 5)]);
    expect(r).toEqual([{ name: 'X', price: 120, supplier: 'Supplier B', commissionPct: 5 }]);
  });

  it('on price tie picks higher commission', () => {
    expect(selectBestOffers([h('X', 100, 8)], [h('X', 100, 12)])[0].supplier).toBe('Supplier B');
    expect(selectBestOffers([h('X', 100, 12)], [h('X', 100, 8)])[0].supplier).toBe('Supplier A');
  });

  it('on full tie picks Supplier A', () => {
    const r = selectBestOffers([h('X', 100, 10)], [h('X', 100, 10)]);
    expect(r).toHaveLength(1);
    expect(r[0].supplier).toBe('Supplier A');
  });

  it('keeps hotels present in only one supplier', () => {
    const r = selectBestOffers([h('OnlyA', 50)], [h('OnlyB', 60)]);
    expect(r.map((o) => [o.name, o.supplier])).toEqual([
      ['OnlyA', 'Supplier A'],
      ['OnlyB', 'Supplier B'],
    ]);
  });

  it('matches names case- and whitespace-insensitively, keeping trimmed display name', () => {
    const r = selectBestOffers([h('  Taj Palace ', 200)], [h('taj palace', 150)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ price: 150, supplier: 'Supplier B', name: 'taj palace' });
  });

  it('handles empty inputs', () => {
    expect(selectBestOffers([], [])).toEqual([]);
    expect(selectBestOffers([h('A', 1)], [])).toHaveLength(1);
    expect(selectBestOffers([], [h('B', 1)])[0].supplier).toBe('Supplier B');
  });

  it('dedupes within a single supplier list', () => {
    const r = selectBestOffers([h('X', 100), h('x', 90)], []);
    expect(r).toEqual([{ name: 'x', price: 90, supplier: 'Supplier A', commissionPct: 10 }]);
  });

  it('sorts by price ascending', () => {
    const r = selectBestOffers([h('C', 30), h('A', 10)], [h('B', 20)]);
    expect(r.map((o) => o.price)).toEqual([10, 20, 30]);
  });
});
