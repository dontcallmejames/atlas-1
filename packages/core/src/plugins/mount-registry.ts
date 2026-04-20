export interface NavItem {
  pluginId: string;
  id: string;
  label: string;
  icon?: string;
  group?: string;
}

export interface ScreenView {
  pluginId: string;
  screenId: string;
  loader: () => Promise<unknown>;
}

type NavListener = (items: NavItem[]) => void;
type ViewListener = (views: ScreenView[]) => void;

/**
 * In-memory registry for plugin-registered nav items and screen views.
 * Core owns the data; the shell subscribes and reflects it in the DOM.
 */
export class MountRegistry {
  private readonly navs = new Map<string, NavItem>();
  private readonly views = new Map<string, ScreenView>();
  private readonly navListeners = new Set<NavListener>();
  private readonly viewListeners = new Set<ViewListener>();

  addNav(item: NavItem): () => void {
    const key = `${item.pluginId}:${item.id}`;
    this.navs.set(key, item);
    this.emitNav();
    return () => {
      this.navs.delete(key);
      this.emitNav();
    };
  }

  addView(view: ScreenView): () => void {
    const key = `${view.pluginId}:${view.screenId}`;
    this.views.set(key, view);
    this.emitView();
    return () => {
      this.views.delete(key);
      this.emitView();
    };
  }

  listNavs(): NavItem[] {
    return [...this.navs.values()];
  }

  listViews(): ScreenView[] {
    return [...this.views.values()];
  }

  getView(screenId: string): ScreenView | undefined {
    for (const v of this.views.values()) if (v.screenId === screenId) return v;
    return undefined;
  }

  onNavsChange(listener: NavListener): () => void {
    this.navListeners.add(listener);
    return () => this.navListeners.delete(listener);
  }

  onViewsChange(listener: ViewListener): () => void {
    this.viewListeners.add(listener);
    return () => this.viewListeners.delete(listener);
  }

  private emitNav(): void {
    const snapshot = this.listNavs();
    for (const l of [...this.navListeners]) l(snapshot);
  }
  private emitView(): void {
    const snapshot = this.listViews();
    for (const l of [...this.viewListeners]) l(snapshot);
  }
}
