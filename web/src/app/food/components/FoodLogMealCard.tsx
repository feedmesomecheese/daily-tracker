"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { FoodMacroDonut } from "./FoodMacroDonut";

export interface FoodLogItem {
  id: string;
  food_name_snapshot: string;
  serving_label_snapshot: string;
  qty: number;
  calories: number;
  fat: number;
  carbs: number;
  protein: number;
  fiber: number;
}

export interface Meal {
  id: string;
  meal_name: string;
  meal_order: number;
  meal_time: string | null;
  items: FoodLogItem[];
}

interface Props {
  meal: Meal;
  onAddFood: () => void;
  onUpdateItem: (mealId: string, itemId: string, qty: number) => void;
  onDeleteItem: (mealId: string, itemId: string) => void;
  onRenameMeal: (mealId: string, name: string) => void;
  onDeleteMeal: (mealId: string) => void;
  onSaveAsTemplate: (mealId: string, name: string) => Promise<void>;
  onApplyTemplate: (mealId: string) => void;
  hasTemplates?: boolean;
  /** Rendered drag handle (passed from parent DnD context) */
  dragHandle?: React.ReactNode;
}

const DONUT_COLORS = ["#22c55e", "#f59e0b", "#60a5fa"];

function MealDonut({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const data = [
    { name: "P", value: protein * 4 },
    { name: "C", value: carbs * 4 },
    { name: "F", value: fat * 9 },
  ].filter((d) => d.value > 0);
  if (data.length === 0) return null;
  return (
    <div className="w-8 h-8 shrink-0 overflow-hidden">
      <PieChart width={32} height={32} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Pie data={data} cx={16} cy={16} innerRadius={8} outerRadius={14} dataKey="value" strokeWidth={0} isAnimationActive={false}>
          {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { name: string; value: number };
            return (
              <div className="rounded border border-border bg-popover px-1.5 py-0.5 text-xs shadow">
                {p.name}: {Math.round(p.value / 4)} g
              </div>
            );
          }}
        />
      </PieChart>
    </div>
  );
}

function sumItems(items: FoodLogItem[]) {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
      fiber: acc.fiber + item.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
}

interface ItemRowProps {
  item: FoodLogItem;
  mealId: string;
  onUpdateItem: (mealId: string, itemId: string, qty: number) => void;
  onDeleteItem: (mealId: string, itemId: string) => void;
}

function ItemRow({ item, mealId, onUpdateItem, onDeleteItem }: ItemRowProps) {
  const displayQty = item.qty % 1 === 0 ? String(item.qty) : item.qty.toFixed(2).replace(/\.?0+$/, "");
  const [qtyDraft, setQtyDraft] = useState(displayQty);

  useEffect(() => {
    setQtyDraft(item.qty % 1 === 0 ? String(item.qty) : item.qty.toFixed(2).replace(/\.?0+$/, ""));
  }, [item.qty]);

  const commitQty = (draft: string) => {
    const num = parseFloat(draft.trim());
    if (!isNaN(num) && num > 0) {
      if (num !== item.qty) onUpdateItem(mealId, item.id, num);
      setQtyDraft(num % 1 === 0 ? String(num) : num.toFixed(2).replace(/\.?0+$/, ""));
    } else {
      setQtyDraft(displayQty);
    }
  };

  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
      {/* Macro donut */}
      <div className="pt-0.5 shrink-0">
        <FoodMacroDonut protein={item.protein} carbs={item.carbs} fat={item.fat} size={22} />
      </div>

      {/* Name + serving */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{item.food_name_snapshot}</div>
        <div className="text-xs text-muted-foreground">
          {item.serving_label_snapshot}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {Math.round(item.calories)} cal &middot; P{Math.round(item.protein)}g &middot; C{Math.round(item.carbs)}g &middot; F{Math.round(item.fat)}g
          {item.fiber > 0 && <> &middot; Fb{Math.round(item.fiber)}g</>}
        </div>
      </div>

      {/* Qty (editable) */}
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="text"
          inputMode="decimal"
          value={qtyDraft}
          onFocus={(e) => { setQtyDraft(""); e.target.select(); }}
          onChange={(e) => setQtyDraft(e.target.value)}
          onBlur={(e) => commitQty(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { commitQty(qtyDraft); e.currentTarget.blur(); }
            if (e.key === "Escape") { setQtyDraft(displayQty); e.currentTarget.blur(); }
          }}
          className="w-14 text-sm text-center rounded border border-border/60 bg-muted/30 px-1 py-0.5 hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background transition-colors"
          title="Click to edit quantity"
        />

        {/* Delete */}
        <button
          onClick={() => onDeleteItem(mealId, item.id)}
          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
          title="Remove item"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function FoodLogMealCard({
  meal,
  onAddFood,
  onUpdateItem,
  onDeleteItem,
  onRenameMeal,
  onDeleteMeal,
  onSaveAsTemplate,
  onApplyTemplate,
  hasTemplates = false,
  dragHandle,
}: Props) {
  const { confirm } = useToast();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(meal.meal_name);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  const totals = sumItems(meal.items);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== meal.meal_name) {
      onRenameMeal(meal.id, trimmed);
    } else {
      setNameDraft(meal.meal_name);
    }
    setEditingName(false);
  };

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow mb-3">
      {/* Card Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        {/* Drag handle */}
        {dragHandle}

        {/* Meal name */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setNameDraft(meal.meal_name);
                  setEditingName(false);
                }
              }}
              className="w-full text-sm font-semibold bg-transparent border-b border-ring focus:outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setNameDraft(meal.meal_name);
                setEditingName(true);
              }}
              className="text-sm font-semibold text-left hover:text-primary transition-colors"
              title="Tap to rename meal"
            >
              {meal.meal_name}
            </button>
          )}
        </div>

        {/* Meal totals + donut */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <MealDonut protein={totals.protein} carbs={totals.carbs} fat={totals.fat} />
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{Math.round(totals.calories)}</span>
            <span>cal</span>
            <span className="text-green-500">P{Math.round(totals.protein)}</span>
            <span className="text-amber-400">C{Math.round(totals.carbs)}</span>
            <span className="text-blue-400">F{Math.round(totals.fat)}</span>
          </div>
        </div>

        {/* Template saved flash */}
        {templateSaved && (
          <span className="text-xs text-green-500 shrink-0 font-medium">✓ Saved</span>
        )}

        {/* Overflow menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => { setMenuOpen(false); setSavingTemplate(false); }} />
              <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-border bg-popover shadow-lg py-1 text-sm">
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                  onClick={() => {
                    setMenuOpen(false);
                    setNameDraft(meal.meal_name);
                    setEditingName(true);
                  }}
                >
                  Rename
                </button>

                {/* Save as Template */}
                {savingTemplate ? (
                  <div className="px-3 py-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">Template name:</p>
                    <input
                      autoFocus
                      type="text"
                      value={templateNameDraft}
                      onChange={(e) => setTemplateNameDraft(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && templateNameDraft.trim()) {
                          setTemplateSaving(true);
                          try {
                            await onSaveAsTemplate(meal.id, templateNameDraft.trim());
                            setMenuOpen(false);
                            setSavingTemplate(false);
                            setTemplateNameDraft("");
                            setTemplateSaved(true);
                            setTimeout(() => setTemplateSaved(false), 2500);
                          } catch { /* parent shows error */ } finally { setTemplateSaving(false); }
                        }
                        if (e.key === "Escape") {
                          setSavingTemplate(false);
                          setTemplateNameDraft("");
                        }
                      }}
                      placeholder={meal.meal_name}
                      className="w-full h-7 px-2 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring mb-1.5"
                    />
                    <button
                      disabled={!templateNameDraft.trim() || templateSaving}
                      onClick={async () => {
                        if (!templateNameDraft.trim()) return;
                        setTemplateSaving(true);
                        try {
                          await onSaveAsTemplate(meal.id, templateNameDraft.trim());
                          setMenuOpen(false);
                          setSavingTemplate(false);
                          setTemplateNameDraft("");
                          setTemplateSaved(true);
                          setTimeout(() => setTemplateSaved(false), 2500);
                        } catch { /* parent shows error */ } finally { setTemplateSaving(false); }
                      }}
                      className="w-full h-6 text-xs rounded bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90"
                    >
                      {templateSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                    onClick={() => {
                      setTemplateNameDraft(meal.meal_name);
                      setSavingTemplate(true);
                    }}
                  >
                    Save as Template
                  </button>
                )}

                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                  onClick={() => {
                    setMenuOpen(false);
                    onApplyTemplate(meal.id);
                  }}
                >
                  Apply Template
                </button>

                <div className="border-t border-border/50 my-1" />
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive transition-colors"
                  onClick={async () => {
                    setMenuOpen(false);
                    if (await confirm({ message: `Delete meal "${meal.meal_name}"?`, destructive: true, confirmLabel: "Delete" })) {
                      onDeleteMeal(meal.id);
                    }
                  }}
                >
                  Delete Meal
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="px-4">
        {meal.items.length === 0 && (
          <p className="text-xs text-muted-foreground py-2 italic">No foods added yet.</p>
        )}
        {meal.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            mealId={meal.id}
            onUpdateItem={onUpdateItem}
            onDeleteItem={onDeleteItem}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 flex items-center gap-4">
        <button
          onClick={onAddFood}
          className="text-sm text-primary hover:text-primary/80 font-medium transition-colors flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Add Food
        </button>
        {hasTemplates && (
          <button
            onClick={() => onApplyTemplate(meal.id)}
            className="text-sm text-muted-foreground hover:text-foreground font-medium transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h11A2.5 2.5 0 0 1 18 4.5v.25a.75.75 0 0 1-1.5 0V4.5A1 1 0 0 0 15.5 3.5h-11A1 1 0 0 0 3.5 4.5v11a1 1 0 0 0 1 1H5a.75.75 0 0 1 0 1.5h-.5A2.5 2.5 0 0 1 2 15.5v-11Z" />
              <path d="M8 8a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8Z" />
            </svg>
            Use Template
          </button>
        )}
      </div>
    </div>
  );
}
