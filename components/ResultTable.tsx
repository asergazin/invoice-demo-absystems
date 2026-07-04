
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { RegistryRow, PaymentStatus, Product } from '../types';
import JSZip from 'jszip';

interface ResultTableProps {
  data: RegistryRow[];
  trash: RegistryRow[];
  onUpdateRow: (dbId: string, field: string, value: any) => void;
  onDeleteRows: (ids: string[]) => void;
  onRestoreRows: (ids: string[]) => void;
  onPermanentDelete: (ids: string[]) => void;
}

interface ColumnDef {
  id: string;
  label: string;
  key?: keyof RegistryRow;
  width: number;
  type?: 'text' | 'number' | 'date' | 'status' | 'product_table';
}

const formatNum = (val: any) => {
  if (val === undefined || val === null || val === '-' || val === '') return '';
  const strVal = String(val).replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(strVal.replace(/[^\d.-]/g, ''));
  if (isNaN(num)) return val;
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

const formatDate = (iso: string) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ru-RU', { 
    day: '2-digit', month: '2-digit', year: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });
};

const STATUS_STYLING: Record<PaymentStatus, { bg: string; dot: string; text: string; border: string }> = {
  'Оплачен': { bg: 'bg-emerald-50', dot: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Не оплачено': { bg: 'bg-orange-50', dot: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-200' },
  'В процессе': { bg: 'bg-blue-50', dot: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-200' },
  'Не начат': { bg: 'bg-slate-100', dot: 'bg-slate-400', text: 'text-slate-600', border: 'border-slate-200' },
  'Отложено': { bg: 'bg-amber-50', dot: 'bg-amber-600', text: 'text-amber-800', border: 'border-amber-200' },
  'Отмена': { bg: 'bg-red-50', dot: 'bg-red-500', text: 'text-red-700', border: 'border-red-200' },
};

export const ResultTable: React.FC<ResultTableProps> = ({ data, trash, onUpdateRow, onDeleteRows, onRestoreRows, onPermanentDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [selectedJsonId, setSelectedJsonId] = useState<string | null>(null);
  const [jsonSearch, setJsonSearch] = useState('');

  // Column management
  const [columns, setColumns] = useState<ColumnDef[]>([
    { id: 'status', label: 'Статус', key: 'Статус', width: 140, type: 'status' },
    { id: 'date_upload', label: 'Загружен', key: 'Дата загрузки', width: 150, type: 'date' },
    { id: 'vendor', label: 'Контрагент', key: 'Контрагент', width: 280 },
    { id: 'bin', label: 'БИН/ИИН', key: 'БИН/ИИН', width: 140 },
    { id: 'invoice_num', label: '№ Счета', key: '№', width: 120 },
    { id: 'products', label: 'Товары', width: 480, type: 'product_table' },
    { id: 'estimate', label: 'Сметная стоимость', key: 'Сметная стоимость', width: 160, type: 'number' },
    { id: 'contract_num', label: 'Номер договора', key: 'Номер договора', width: 150 },
    { id: 'contract_sum', label: 'Сумма по договору', key: 'Сумма по договору', width: 160, type: 'number' },
    { id: 'to_pay', label: 'Сумма к оплате', key: 'Сумма к оплате', width: 160, type: 'number' },
    { id: 'vat', label: 'Сумма НДС', key: 'Сумма НДС', width: 140, type: 'number' },
    { id: 'no_vat', label: 'Сумма без НДС', key: 'Сумма без НДС', width: 140, type: 'number' },
    { id: 'note', label: 'Примечание', key: 'Примечание', width: 280 },
    { id: 'comments_fd', label: 'Комментарии ФД', key: 'Комментарии ФД', width: 220 },
    { id: 'applicant', label: 'Заявитель', key: 'Заявитель', width: 140 },
    { id: 'date_payment', label: 'Дата оплаты', key: 'Дата оплаты', width: 200, type: 'date' },
    { id: 'date_modified', label: 'Изменен', key: 'Дата изменения', width: 150, type: 'date' },
  ]);

  // Filters logic
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [filterMenuOpen, setFilterMenuOpen] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');

  const filteredData = useMemo(() => {
    return data.filter(row => {
      // Global search
      const matchesSearch = searchTerm === '' || 
        Object.values(row).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase())) ||
        row.Товары?.some(p => p.Наименование.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // Column specific filters
      return Object.entries(activeFilters).every(([colId, selectedValues]) => {
        if (!selectedValues || selectedValues.length === 0) return true;
        const col = columns.find(c => c.id === colId);
        if (!col || !col.key) return true;
        const val = String(row[col.key] || '');
        return selectedValues.includes(val);
      });
    });
  }, [data, searchTerm, activeFilters, columns]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredData.length / rowsPerPage)), [filteredData.length, rowsPerPage]);

  const paginatedData = useMemo(() => {
    return filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  }, [filteredData, currentPage, rowsPerPage]);

  const toggleFilterValue = (colId: string, value: string) => {
    setActiveFilters(prev => {
      const current = prev[colId] || [];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [colId]: next };
    });
  };

  const clearFilter = (colId: string) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
  };

  const selectAllFilter = (colId: string, values: string[]) => {
    setActiveFilters(prev => ({ ...prev, [colId]: values }));
  };

  // Column Resizing
  const resizingCol = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent, colId: string, currentWidth: number) => {
    resizingCol.current = { id: colId, startX: e.clientX, startWidth: currentWidth };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!resizingCol.current) return;
    const diff = e.clientX - resizingCol.current.startX;
    const newWidth = Math.max(80, resizingCol.current.startWidth + diff);
    setColumns(prev => prev.map(c => c.id === resizingCol.current!.id ? { ...c, width: newWidth } : c));
  };
  const onMouseUp = () => {
    resizingCol.current = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    data.forEach(row => zip.file(`${row.Контрагент}_${row.dbId.substring(0,4)}.json`, JSON.stringify(row, null, 2)));
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `Registry_${new Date().toISOString().slice(0,10)}.zip`;
    link.click();
  };

  // Column filter unique values
  const getUniqueValues = (colId: string) => {
    const col = columns.find(c => c.id === colId);
    if (!col || !col.key) return [];
    const values = Array.from(new Set(data.map(r => String(r[col.key!] || '')))).sort();
    return values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()));
  };

  return (
    <div className="flex flex-col h-full gap-4 text-xs font-medium">
      {/* Header toolbar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative w-72">
            <input 
              type="text" 
              placeholder="Глобальный поиск..." 
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all bg-slate-50 hover:bg-white text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <svg className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <div className="text-[11px] text-slate-400 font-bold uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">Строк: {filteredData.length}</div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => { setIsJsonModalOpen(true); setSelectedJsonId(data[0]?.dbId || null); }} className="px-5 py-2.5 bg-indigo-50 text-indigo-700 font-bold uppercase tracking-wider rounded-xl hover:bg-indigo-100 transition-all border border-indigo-100">JSON</button>
          <button onClick={() => setIsTrashOpen(true)} className="px-5 py-2.5 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider rounded-xl hover:bg-slate-100 transition-all border border-slate-200 relative">
            Корзина {trash.length > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold shadow-md shadow-red-100 animate-pulse">{trash.length}</span>}
          </button>
          <button onClick={() => onDeleteRows(Array.from(selectedIds))} disabled={selectedIds.size === 0} className="px-5 py-2.5 bg-red-600 text-white font-bold uppercase tracking-wider rounded-xl disabled:bg-slate-200 transition-all shadow-xl shadow-red-100">Удалить ({selectedIds.size})</button>
        </div>
      </div>

      {/* Main Grid Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col flex-1 border-b-4 border-indigo-600">
        <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 relative" style={{ minHeight: '600px' }}>
          <table className="table-fixed border-collapse bg-white w-max">
            <thead className="sticky top-0 z-40">
              <tr className="bg-slate-100/90 backdrop-blur-md border-b border-slate-300">
                <th className="w-12 px-3 py-4 border-r border-slate-300 text-center">
                  <input type="checkbox" className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" checked={selectedIds.size === paginatedData.length && paginatedData.length > 0} onChange={() => setSelectedIds(selectedIds.size === paginatedData.length ? new Set() : new Set(paginatedData.map(r => r.dbId)))} />
                </th>
                {columns.map(col => (
                  <th key={col.id} style={{ width: col.width }} className="px-4 py-4 font-bold text-slate-700 border-r border-slate-300 text-left relative group select-none whitespace-nowrap bg-slate-100/50 uppercase tracking-tighter">
                    <div className="flex items-center justify-between gap-1 overflow-hidden">
                      <span className="truncate pr-4">{col.label}</span>
                      {col.key && (
                        <button onClick={() => { setFilterMenuOpen(filterMenuOpen === col.id ? null : col.id); setFilterSearch(''); }} className={`p-1.5 rounded-lg hover:bg-slate-300 transition-colors ${activeFilters[col.id] ? 'bg-blue-600 text-white' : 'text-slate-400 opacity-0 group-hover:opacity-100'}`}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                        </button>
                      )}
                    </div>
                    {/* Resizer */}
                    <div onMouseDown={(e) => onMouseDown(e, col.id, col.width)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 transition-colors z-10" />
                    
                    {/* Excel-style Filter Popover */}
                    {filterMenuOpen === col.id && col.key && (
                      <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-2xl z-50 p-5 animate-in fade-in slide-in-from-top-2 border-t-4 border-blue-600">
                        <div className="flex justify-between items-center mb-4">
                          <span className="font-black text-[10px] uppercase text-slate-400 tracking-[0.2em]">{col.label}</span>
                          <button onClick={() => clearFilter(col.id)} className="text-[10px] text-blue-600 font-black uppercase hover:underline">Очистить</button>
                        </div>
                        <div className="relative mb-4">
                          <input 
                            type="text" 
                            autoFocus
                            placeholder="Поиск..." 
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 text-xs"
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                          />
                          <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <div className="flex gap-4 mb-3 border-b border-slate-100 pb-3">
                           <button onClick={() => selectAllFilter(col.id, getUniqueValues(col.id))} className="text-[10px] font-bold text-indigo-600 uppercase hover:text-indigo-800 transition-colors">Выбрать все</button>
                           <button onClick={() => clearFilter(col.id)} className="text-[10px] font-bold text-slate-400 uppercase hover:text-slate-600 transition-colors">Сбросить</button>
                        </div>
                        <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1 mb-4 pr-1">
                          {getUniqueValues(col.id).map(val => (
                            <label key={val} className="flex items-center gap-2.5 cursor-pointer p-2 hover:bg-slate-50 rounded-xl transition-all group">
                              <input 
                                type="checkbox" 
                                checked={activeFilters[col.id]?.includes(val) || false} 
                                onChange={() => toggleFilterValue(col.id, val)} 
                                className="w-4 h-4 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500" 
                              />
                              <span className="text-xs text-slate-700 truncate group-hover:text-slate-900 font-semibold">{val || '(Пусто)'}</span>
                            </label>
                          ))}
                          {getUniqueValues(col.id).length === 0 && <div className="text-center py-4 text-[10px] text-slate-300 font-bold uppercase">Ничего не найдено</div>}
                        </div>
                        <button onClick={() => setFilterMenuOpen(null)} className="w-full py-3 bg-blue-600 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">Применить</button>
                      </div>
                    )}
                  </th>
                ))}
                <th className="w-12 px-3 py-4 text-center border-slate-300 text-slate-400 font-bold bg-slate-100/50">#</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedData.map((row, idx) => (
                <tr key={row.dbId} className={`group transition-colors ${selectedIds.has(row.dbId) ? 'bg-indigo-50/70' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                  <td className="px-3 py-4 border-r border-slate-200 text-center align-top">
                    <input type="checkbox" checked={selectedIds.has(row.dbId)} onChange={() => setSelectedIds(prev => { const n = new Set(prev); if (n.has(row.dbId)) n.delete(row.dbId); else n.add(row.dbId); return n; })} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
                  </td>
                  {columns.map(col => {
                    // Precise alignment: Each TD maps to one column ID
                    if (col.type === 'status') {
                      const style = STATUS_STYLING[row.Статус] || STATUS_STYLING['Не начат'];
                      return (
                        <td key={col.id} className="px-3 py-4 border-r border-slate-200 align-top">
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${style.bg} ${style.border} ${style.text} shadow-sm`}>
                            <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                            <select 
                              className="bg-transparent text-[10px] font-black uppercase outline-none cursor-pointer p-0 border-0" 
                              value={row.Статус} 
                              onChange={(e) => onUpdateRow(row.dbId, 'Статус', e.target.value)}
                            >
                              {Object.keys(STATUS_STYLING).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </td>
                      );
                    }
                    if (col.type === 'product_table') {
                      return (
                        <td key={col.id} className="px-0 py-0 border-r border-slate-200 align-top">
                          <div className="bg-emerald-50/20 h-full">
                            <table className="w-full text-[10px] border-collapse">
                              <thead className="sticky top-0 bg-emerald-100/30 z-10 backdrop-blur-sm">
                                <tr className="border-b border-emerald-100">
                                  <th className="w-10 px-1 py-1 text-center font-bold text-emerald-700 border-r border-emerald-100">№</th>
                                  <th className="px-3 py-1 text-left font-bold text-emerald-700 border-r border-emerald-100">Наименование</th>
                                  <th className="w-16 px-1 py-1 text-right font-bold text-emerald-700 border-r border-emerald-100">Кол-во</th>
                                  <th className="w-24 px-1 py-1 text-right font-bold text-emerald-700 border-r border-emerald-100">Цена</th>
                                  <th className="w-28 px-1 py-1 text-right font-black text-emerald-800">Сумма</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-emerald-50">
                                {row.Товары?.map((p, pidx) => (
                                  <tr key={pidx} className="hover:bg-emerald-100/30 transition-colors">
                                    <td className="px-1 py-2 text-center text-emerald-600 border-r border-emerald-100 font-bold">{p["№ Товара"] || pidx + 1}</td>
                                    <td className="px-3 py-2 text-emerald-900 font-medium leading-relaxed italic border-r border-emerald-100">{p.Наименование}</td>
                                    <td className="px-1 py-2 text-right text-emerald-900 font-mono font-black border-r border-emerald-100">{p["Кол-во товара"]}</td>
                                    <td className="px-1 py-2 text-right text-emerald-900 font-mono font-bold border-r border-emerald-100">{formatNum(p["Цена товара"])}</td>
                                    <td className="px-2 py-2 text-right text-emerald-950 font-black font-mono bg-emerald-100/10">{formatNum(p["Сумма товара"])}</td>
                                  </tr>
                                ))}
                                {(!row.Товары || row.Товары.length === 0) && (
                                  <tr><td colSpan={5} className="py-4 text-center text-[9px] font-bold uppercase text-slate-300">Товары не указаны</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      );
                    }
                    if (col.type === 'date') {
                      const val = row[col.key!] as string;
                      if (col.id === 'date_payment') {
                        return (
                          <td key={col.id} className="px-3 py-4 border-r border-slate-200 align-top">
                            <input 
                              type="datetime-local" 
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all shadow-sm" 
                              value={val ? val.substring(0, 16) : ''} 
                              onChange={(e) => onUpdateRow(row.dbId, col.key!, e.target.value)} 
                            />
                          </td>
                        );
                      }
                      return <td key={col.id} className="px-4 py-4 border-r border-slate-200 align-top text-[11px] font-bold text-slate-400">{formatDate(val)}</td>;
                    }
                    if (col.type === 'number') {
                      return <td key={col.id} className="px-4 py-4 border-r border-slate-200 align-top text-right font-mono font-black text-slate-900 text-[12px]">{formatNum(row[col.key!])}</td>;
                    }

                    // Default text / textarea mapping
                    const val = String(row[col.key!] || '');
                    return (
                      <td key={col.id} className="px-0 py-0 border-r border-slate-200 align-top">
                        <textarea 
                          className="w-full min-h-[40px] h-full p-4 bg-transparent focus:bg-white border-0 outline-none text-[11px] font-semibold text-slate-800 leading-relaxed resize-none transition-all placeholder-slate-300"
                          value={val}
                          onChange={(e) => onUpdateRow(row.dbId, col.key!, e.target.value)}
                          placeholder="..."
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-4 text-center align-top border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onDeleteRows([row.dbId])} className="p-2 bg-red-50 text-red-300 hover:text-red-600 hover:bg-red-100 rounded-xl transition-all shadow-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer pagination info */}
        <div className="bg-slate-50 px-8 py-4 border-t border-slate-200 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-400">
          <div>Показано <span className="text-slate-900 font-black">{paginatedData.length}</span> из <span className="text-slate-900 font-black">{filteredData.length}</span> строк</div>
          <div className="flex items-center gap-3">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 text-indigo-600 font-black disabled:opacity-30 shadow-sm transition-all">Назад</button>
            <div className="flex items-center px-6 text-slate-900">Страница {currentPage} из {totalPages}</div>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 text-indigo-600 font-black disabled:opacity-30 shadow-sm transition-all">Вперед</button>
          </div>
        </div>
      </div>

      {/* JSON Viewer Modal with List/Search/Zip */}
      {isJsonModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-7xl h-[85vh] rounded-[3.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.5)] flex overflow-hidden animate-in zoom-in-95 border border-white/20">
            <div className="w-1/3 border-r border-slate-100 flex flex-col bg-slate-50/50">
              <div className="p-8 border-b border-slate-100 bg-white/50">
                <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter mb-4">Детальный JSON</h3>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Поиск по списку..." 
                    className="w-full px-5 py-3 text-sm font-bold border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-white transition-all shadow-sm" 
                    value={jsonSearch} 
                    onChange={(e) => setJsonSearch(e.target.value)} 
                  />
                  <svg className="absolute right-4 top-3.5 w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                {data.filter(r => r.Контрагент.toLowerCase().includes(jsonSearch.toLowerCase()) || (r["№"] && r["№"].toLowerCase().includes(jsonSearch.toLowerCase()))).map(item => (
                  <div key={item.dbId} onClick={() => setSelectedJsonId(item.dbId)} className={`p-5 rounded-[2rem] cursor-pointer hover:bg-white hover:shadow-xl transition-all border border-transparent ${selectedJsonId === item.dbId ? 'bg-white border-indigo-200 shadow-2xl shadow-indigo-100 scale-[1.02] z-10' : ''}`}>
                    <div className="text-[12px] font-black text-slate-900 uppercase tracking-tight">{item.Контрагент}</div>
                    <div className="text-[10px] text-indigo-500 font-bold mt-2 uppercase tracking-[0.2em]">{item["№"] || 'БЕЗ НОМЕРА'} • {formatNum(item["Сумма к оплате"])} ₸</div>
                  </div>
                ))}
              </div>
              <div className="p-8 border-t border-slate-100 bg-white space-y-3">
                <button onClick={handleDownloadZip} className="w-full py-4 bg-indigo-600 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 active:scale-95">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Скачать всё в ZIP
                </button>
                <button onClick={() => setIsJsonModalOpen(false)} className="w-full py-4 border border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl hover:bg-slate-50 transition-all active:scale-95">Закрыть окно</button>
              </div>
            </div>
            <div className="w-2/3 bg-[#0d1117] text-[#e6edf3] flex flex-col overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 z-10 pointer-events-none">
                 <div className="w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px]" />
              </div>
              <div className="px-10 py-6 border-b border-white/5 flex items-center justify-between bg-[#161b22]/80 backdrop-blur-md z-20">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-500">JSON Inspector</span>
                  <span className="text-xs font-mono text-slate-400 mt-1 uppercase">ID: {selectedJsonId}</span>
                </div>
                <button onClick={() => {
                  const el = data.find(r => r.dbId === selectedJsonId);
                  if (el) {
                    const blob = new Blob([JSON.stringify(el, null, 2)], { type: 'application/json' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `invoice_${selectedJsonId}.json`;
                    link.click();
                  }
                }} className="px-6 py-2.5 bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:bg-white/10 hover:text-white rounded-xl transition-all border border-white/10">Скачать файл</button>
              </div>
              <div className="flex-1 overflow-auto p-12 custom-scrollbar z-20">
                <pre className="font-mono text-[12px] leading-relaxed selection:bg-indigo-500/30">
                  {selectedJsonId ? JSON.stringify(data.find(r => r.dbId === selectedJsonId), null, 2) : '// Пожалуйста, выберите счет в списке слева'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trash Modal */}
      {isTrashOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-4xl rounded-[3.5rem] shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-8 duration-500 overflow-hidden border border-white/20">
            <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 bg-red-100 text-red-500 rounded-[1.5rem] flex items-center justify-center shadow-inner ring-8 ring-red-50"><svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></div>
                <div>
                   <h3 className="font-black text-3xl text-slate-900 uppercase tracking-tighter leading-none">Корзина ({trash.length})</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Удаленные записи временно хранятся здесь</p>
                </div>
              </div>
              <button onClick={() => setIsTrashOpen(false)} className="p-4 hover:bg-slate-200 rounded-[1.5rem] transition-all text-slate-400"><svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 space-y-4 custom-scrollbar">
              {trash.length === 0 ? <div className="text-center py-24 text-slate-300 font-black uppercase tracking-[0.5em] text-xs">Корзина пуста</div> : trash.map(item => (
                <div key={item.dbId} className="flex items-center justify-between p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 hover:border-indigo-200 transition-all group hover:shadow-2xl hover:shadow-indigo-50">
                  <div className="overflow-hidden">
                    <p className="font-black text-slate-900 text-lg truncate uppercase tracking-tight">{item.Контрагент}</p>
                    <p className="text-xs text-slate-400 font-bold mt-2 uppercase tracking-widest leading-relaxed">{item.Примечание || item["№"]} • {formatNum(item["Сумма к оплате"])} ₸</p>
                    <div className="mt-4 flex items-center gap-3">
                       <span className="text-[9px] bg-red-100 text-red-600 px-3 py-1 rounded-full font-black uppercase">Удалено</span>
                       <span className="text-[10px] text-slate-400 font-bold italic">{new Date(item.deletedAt!).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-4 shrink-0">
                    <button onClick={() => onRestoreRows([item.dbId])} className="px-8 py-3 bg-indigo-600 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl hover:bg-indigo-700 shadow-2xl shadow-indigo-100 transition-all active:scale-95">Восстановить</button>
                    <button onClick={() => onPermanentDelete([item.dbId])} className="px-8 py-3 bg-white border border-red-100 text-red-500 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl hover:bg-red-50 transition-all active:scale-95">Стереть</button>
                  </div>
                </div>
              ))}
            </div>
            {trash.length > 0 && (
              <div className="p-10 border-t border-slate-100 bg-slate-50 flex gap-4 rounded-b-[3.5rem]">
                <button onClick={() => onPermanentDelete(trash.map(t => t.dbId))} className="w-full py-5 text-red-600 font-black uppercase text-xs tracking-[0.4em] hover:bg-red-50 rounded-3xl transition-all">Очистить корзину навсегда</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
