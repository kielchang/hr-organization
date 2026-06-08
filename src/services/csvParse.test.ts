import { parseCsv } from './csvParse';

describe('parseCsv', () => {
  it('基本逗號分隔', () => {
    expect(parseCsv('a,b,c')).toEqual([['a', 'b', 'c']]);
  });

  it('多列（LF / CRLF / CR 皆可）', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\rc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('去除 UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b')).toEqual([['a', 'b']]);
  });

  it('引號內可含逗號與換行', () => {
    expect(parseCsv('"a,1","b\nx",c')).toEqual([['a,1', 'b\nx', 'c']]);
  });

  it('連續雙引號 = 跳脫的引號', () => {
    expect(parseCsv('"he said ""hi"""')).toEqual([['he said "hi"']]);
  });

  it('欄位前後空白會被 trim', () => {
    expect(parseCsv(' a , b ')).toEqual([['a', 'b']]);
  });

  it('略過全空白列', () => {
    expect(parseCsv('a,b\n\n,\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('結尾無換行的最後一列也會收進', () => {
    expect(parseCsv('a,b\nc,d')).toHaveLength(2);
    expect(parseCsv('x')).toEqual([['x']]);
  });

  it('空字串回空陣列', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
