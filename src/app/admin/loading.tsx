export default function AdminLoading() {
  return (
    <div className="admin-loading-shell">
      <div className="admin-loading-header">
        <div className="admin-skeleton admin-skeleton-eyebrow" />
        <div className="admin-skeleton admin-skeleton-title" />
      </div>

      <div className="admin-loading-grid">
        <div className="admin-skeleton admin-skeleton-card" />
        <div className="admin-skeleton admin-skeleton-card" />
        <div className="admin-skeleton admin-skeleton-card" />
      </div>

      <div className="admin-skeleton admin-skeleton-table" />
    </div>
  );
}
