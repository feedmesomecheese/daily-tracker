"use client";

export interface FoodItem {
  id: string;
  name: string;
  category: string;
  sub_category?: string;
  is_favorited: boolean;
  is_custom?: boolean;
  owner_id?: string | null;
  servings: Array<{
    id: string;
    label: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    is_default: boolean;
    owner_id?: string | null;
  }>;
}

interface Props {
  item: FoodItem;
  onFavoriteToggle: (id: string, currentlyFavorited: boolean) => void;
  onEdit: () => void; // always provided — edit = manage servings for global, full edit for custom
}

export function FoodLibraryRow({ item, onFavoriteToggle, onEdit }: Props) {
  const defaultServing =
    item.servings.find((s) => s.is_default) ?? item.servings[0];

  return (
    <div className="flex items-center gap-3 bg-card border rounded-lg p-3 mb-2">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-medium truncate">{item.name}</p>
          {item.is_custom && (
            <span
              title="Your custom food"
              className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 flex-shrink-0"
            >
              {/* person icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
              Custom
            </span>
          )}
        </div>
        {defaultServing ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            {defaultServing.label} &middot;{" "}
            {Math.round(defaultServing.calories)} kcal &middot;{" "}
            {Math.round(defaultServing.protein)}g P &middot;{" "}
            {Math.round(defaultServing.carbs)}g C &middot;{" "}
            {Math.round(defaultServing.fat)}g F
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">No servings</p>
        )}
        {item.sub_category && (
          <p className="text-xs text-muted-foreground/60 mt-0.5">{item.sub_category}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Edit / manage servings button — always shown */}
        <button
          onClick={onEdit}
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title={item.is_custom ? "Edit food" : "Manage serving sizes"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>

        {/* Favorite button */}
        <button
          onClick={() => onFavoriteToggle(item.id, item.is_favorited)}
          className="p-1.5 rounded hover:bg-accent transition-colors"
          title={item.is_favorited ? "Remove from favorites" : "Add to favorites"}
        >
          {item.is_favorited ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"
              fill="#eab308" stroke="#eab308" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className="text-muted-foreground">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
