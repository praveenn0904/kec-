import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDebounce, useMeta } from '../hooks.js';
import { saveBlob } from '../utils.js';
import { SECTION_LIST, YEAR_LIST } from '../academic.js';
import Icon from '../components/icons.jsx';
import { Avatar, Modal, PageHeader, RoleBadge, Spinner, StatusChip, useToast } from '../components/ui.jsx';
import ContactForm from '../components/ContactForm.jsx';
import ContactDetail from '../components/ContactDetail.jsx';

const PAGE_SIZE = 10;

export default function Directory() {
  const { user } = useAuth();
  // Department staff and the administrator manage people; students only read the staff directory.
  const isFaculty = user.role !== 'student';
  const isStaffOnly = user.role === 'staff';
  const meta = useMeta();
  const toast = useToast();
  const departments = meta?.departments || [];

  const [filters, setFilters] = useState({
    q: '', role: isFaculty ? '' : 'staff', department: '', year: '', section: '', status: '',
    sort: 'name', order: 'asc', page: 1,
  });
  const [rows, setRows] = useState([]);
  const [pageMeta, setPageMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  const q = useDebounce(filters.q);
  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.contacts({ ...filters, q, limit: PAGE_SIZE });
      setRows(res.data);
      setPageMeta(res.meta);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filters.role, filters.department, filters.year, filters.section, filters.status, filters.sort, filters.order, filters.page]);

  useEffect(() => { load(); }, [load]);

  const close = () => setModal(null);

  const save = async (values) => {
    const editing = modal.type === 'edit';
    if (editing) await api.updateContact(modal.contact.id, values);
    else await api.createContact(values);
    close();
    toast(editing ? 'Contact updated' : 'Contact added');
    load();
  };

  const confirmDelete = async () => {
    try {
      await api.deleteContact(modal.contact.id);
      toast('Contact deleted');
      close();
      if (rows.length === 1 && filters.page > 1) setFilters((f) => ({ ...f, page: f.page - 1 }));
      else load();
    } catch (e) {
      toast(e.message, 'error');
      close();
    }
  };

  const exportCsv = async () => {
    try {
      saveBlob((await api.exportCsv({ ...filters, q })).blob, 'department-contacts.csv');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const from = pageMeta ? (pageMeta.total ? (pageMeta.page - 1) * pageMeta.limit + 1 : 0) : 0;
  const to = pageMeta ? Math.min(pageMeta.total, pageMeta.page * pageMeta.limit) : 0;
  const filtered = filters.q || filters.role || filters.department || filters.year || filters.section || filters.status;
  const showStudents = !isFaculty || filters.role !== 'staff';

  return (
    <>
      <PageHeader
        title={isStaffOnly ? `${user.department} Directory` : user.role === 'admin' ? 'People' : 'Staff Directory'}
        subtitle={isStaffOnly ? 'Students and staff of your department.' : user.role === 'admin' ? 'Everyone in the college, every department.' : 'Contact details of department staff.'}
      >
        {isStaffOnly && <button type="button" className="btn" onClick={exportCsv}><Icon name="download" /> Export CSV</button>}
        {isFaculty && <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'add' })}><Icon name="plus" /> Add contact</button>}
      </PageHeader>

      <div className="card toolbar">
        <div className="search-box">
          <Icon name="search" />
          <input
            type="search"
            placeholder={isFaculty ? 'Search name, email, phone, roll no, employee ID…' : 'Search by name, email, phone or designation…'}
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            aria-label="Search"
          />
        </div>

        {isFaculty && (
          <div className="segmented" role="group" aria-label="Filter by role">
            {[['', 'All'], ['student', 'Students'], ['staff', 'Staff']].map(([value, label]) => (
              <button key={label} type="button" className={filters.role === value ? 'active' : ''}
                onClick={() => set({ role: value, year: value === 'staff' ? '' : filters.year, section: value === 'staff' ? '' : filters.section })}>
                {label}
              </button>
            ))}
          </div>
        )}

        {!isStaffOnly && (
          <select value={filters.department} onChange={(e) => set({ department: e.target.value })} aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.code} value={d.name}>{d.name}</option>)}
          </select>
        )}

        {isFaculty && showStudents && (
          <>
            <select value={filters.year} onChange={(e) => set({ year: e.target.value })} aria-label="Year">
              <option value="">All years</option>
              {YEAR_LIST.map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
            <select value={filters.section} onChange={(e) => set({ section: e.target.value })} aria-label="Section">
              <option value="">All sections</option>
              {SECTION_LIST.map((s) => <option key={s} value={s}>Section {s}</option>)}
            </select>
          </>
        )}

        {isFaculty && (
          <select value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        )}

        <select
          value={`${filters.sort}:${filters.order}`}
          onChange={(e) => { const [sort, order] = e.target.value.split(':'); set({ sort, order }); }}
          aria-label="Sort"
        >
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
          {isFaculty && <option value="createdAt:desc">Newest first</option>}
        </select>
      </div>

      {error && <div className="banner banner-error" role="alert">{error} <button type="button" className="link-btn" onClick={load}>Retry</button></div>}

      <div className="card table-card">
        {loading && !rows.length ? (
          <Spinner label="Loading contacts…" />
        ) : rows.length === 0 ? (
          <div className="empty">
            <p>No contacts match your search.</p>
            {filtered && (
              <button type="button" className="btn" onClick={() => set({ q: '', role: isFaculty ? '' : 'staff', department: '', year: '', section: '', status: '' })}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Department</th>
                  {isFaculty && <th>Class</th>}
                  {isFaculty && <th>Type</th>}
                  <th>Email</th>
                  <th>Phone</th>
                  {isFaculty && <th>Status</th>}
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => setModal({ type: 'view', contact: c })} className={c.status === 'inactive' ? 'row-inactive' : ''}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={c.name} role={c.role} />
                        <div>
                          <strong>{c.name}</strong>
                          <small>{c.role === 'student' ? c.course : c.designation}</small>
                        </div>
                      </div>
                    </td>
                    <td>{c.role === 'student' ? c.rollNumber : c.employeeId}</td>
                    <td>{c.department}</td>
                    {isFaculty && <td>{c.role === 'student' ? `Year ${c.year} · ${c.section}` : '–'}</td>}
                    {isFaculty && <td><RoleBadge role={c.role} /></td>}
                    <td><a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>{c.email}</a></td>
                    <td className="nowrap">{c.phone}</td>
                    {isFaculty && <td><StatusChip status={c.status} /></td>}
                    <td className="nowrap actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'view', contact: c })}>View</button>
                      {isFaculty && <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'edit', contact: c })}>Edit</button>}
                      {isFaculty && c.id !== user.id && (
                        <button type="button" className="btn btn-small btn-danger" onClick={() => setModal({ type: 'delete', contact: c })}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageMeta && pageMeta.total > 0 && (
          <div className="table-foot">
            <span className="muted" aria-live="polite">Showing {from}–{to} of {pageMeta.total}</span>
            {pageMeta.totalPages > 1 && (
              <div className="pager">
                <button type="button" className="btn btn-small" disabled={pageMeta.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>← Prev</button>
                <span>Page {pageMeta.page} of {pageMeta.totalPages}</span>
                <button type="button" className="btn btn-small" disabled={pageMeta.page >= pageMeta.totalPages}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {modal?.type === 'view' && (
        <Modal title="Contact details" onClose={close}>
          <ContactDetail
            contact={modal.contact}
            onEdit={(contact) => setModal({ type: 'edit', contact })}
            onDelete={(contact) => setModal({ type: 'delete', contact })}
          />
        </Modal>
      )}
      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <Modal title={modal.type === 'add' ? 'Add contact' : 'Edit contact'} onClose={close} wide>
          <ContactForm
            initial={modal.contact}
            mode={modal.type === 'add' ? 'create' : modal.contact.id === user.id ? 'self' : 'edit'}
            onSubmit={save}
            onCancel={close}
          />
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="Delete contact?" onClose={close}>
          <p>
            This permanently removes <strong>{modal.contact.name}</strong>
            {modal.contact.role === 'student' ? ', their login and all of their attendance records' : ' and their login'}.
            This cannot be undone.
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-danger-solid" onClick={confirmDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </>
  );
}
