import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { adminAPI } from "@/lib/api";
import { toast } from "sonner";

export default function DeliveryBankDeposits() {
  const [loading, setLoading] = useState(true);
  const [deposits, setDeposits] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [settings, setSettings] = useState({
    bankName: "",
    accountHolder: "",
    accountNumber: "",
    ifsc: "",
    branch: "",
    approvalTime: ""
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [rejectingDeposit, setRejectingDeposit] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadDeposits = async () => {
    try {
      setLoading(true);
      const params = statusFilter !== "all" ? { status: statusFilter } : {};
      const res = await adminAPI.getDeliveryBankDeposits(params);
      const list = res?.data?.data?.deposits || [];
      setDeposits(list);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load bank deposits");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeposits();
  }, [statusFilter]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await adminAPI.getBusinessSettings();
        const data = res?.data?.data || res?.data || {};
        setSettings({
          bankName: data.bankName || "",
          accountHolder: data.accountHolder || "",
          accountNumber: data.accountNumber || "",
          ifsc: data.ifsc || "",
          branch: data.branch || "",
          approvalTime: data.approvalTime || ""
        });
      } catch (_) {}
    };
    loadSettings();
  }, []);

  const handleApprove = async (id) => {
    try {
      await adminAPI.approveDeliveryBankDeposit(id);
      toast.success("Deposit approved");
      loadDeposits();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to approve deposit");
    }
  };

  const handleReject = (deposit) => {
    setRejectReason("");
    setRejectingDeposit(deposit);
  };

  const submitReject = async () => {
    if (!rejectingDeposit?._id) return;
    try {
      await adminAPI.rejectDeliveryBankDeposit(rejectingDeposit._id, rejectReason || "");
      toast.success("Deposit rejected");
      setRejectingDeposit(null);
      setRejectReason("");
      loadDeposits();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to reject deposit");
    }
  };

  const handleSettingsChange = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      await adminAPI.updateBusinessSettings({ ...settings }, {});
      toast.success("Bank details updated");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update bank details");
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Delivery Bank Deposits</h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-1">
            Review and approve delivery boy bank deposits.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Bank Details (for Delivery Deposits)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Bank Name</label>
            <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              placeholder="e.g., HDFC Bank"
              value={settings.bankName} onChange={(e) => handleSettingsChange("bankName", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Account Holder</label>
            <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              placeholder="e.g., GrhaPoch"
              value={settings.accountHolder} onChange={(e) => handleSettingsChange("accountHolder", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Account Number</label>
            <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              placeholder="Account number"
              value={settings.accountNumber} onChange={(e) => handleSettingsChange("accountNumber", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">IFSC</label>
            <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              placeholder="IFSC code"
              value={settings.ifsc} onChange={(e) => handleSettingsChange("ifsc", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Branch</label>
            <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              placeholder="Branch"
              value={settings.branch} onChange={(e) => handleSettingsChange("branch", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Approval Time (hours)</label>
            <div className="flex items-center gap-2">
              <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                placeholder="e.g., 24"
                value={settings.approvalTime} onChange={(e) => handleSettingsChange("approvalTime", e.target.value)} />
              <span className="text-xs text-slate-500 whitespace-nowrap">hours</span>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-50"
          >
            {savingSettings ? "Saving..." : "Save Bank Details"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Delivery Boy</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Amount</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Cash In Hand</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Submitted</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Txn</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Slip</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="8" className="px-4 py-6 text-center text-slate-500">Loading...</td>
              </tr>
            )}
            {!loading && deposits.length === 0 && (
              <tr>
                <td colSpan="8" className="px-4 py-6 text-center text-slate-500">No deposits found.</td>
              </tr>
            )}
            {!loading && deposits.map((d) => (
              <tr key={d._id} className="border-t">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{d.deliveryId?.name || "Unknown"}</div>
                  <div className="text-xs text-slate-500">{d.deliveryId?.phone || d.deliveryId?.email || ""}</div>
                </td>
                <td className="px-4 py-3">₹ {Number(d.amount || 0).toFixed(2)}</td>
                <td className="px-4 py-3">
                  ₹ {Number(d.metadata?.cashInHandAtSubmit || d.metadata?.get?.("cashInHandAtSubmit") || 0).toFixed(2)}
                </td>
                <td className="px-4 py-3 capitalize">
                  <div className="font-medium">{d.status}</div>
                  {d.status === "rejected" && d.rejectionReason ? (
                    <div className="text-xs text-rose-600 mt-0.5">{d.rejectionReason}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">{new Date(d.submittedAt || d.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedDeposit(d)}
                    className="inline-flex items-center gap-1 text-blue-600 text-xs hover:underline"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                </td>
                <td className="px-4 py-3">
                  {d.slips?.length || d.slip?.url ? (
                    <button
                      type="button"
                      onClick={() => setSelectedDeposit(d)}
                      className="text-blue-600 text-xs hover:underline"
                    >
                      {d.slips?.length || (d.slip?.url ? 1 : 0)} file(s)
                    </button>
                  ) : "-"}
                </td>
                <td className="px-4 py-3">
                  {d.status === "pending" ? (
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(d._id)} className="px-3 py-1 text-xs rounded bg-emerald-600 text-white">Approve</button>
                      <button onClick={() => handleReject(d)} className="px-3 py-1 text-xs rounded bg-rose-600 text-white">Reject</button>
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedDeposit && (() => {
        const slips = selectedDeposit.slips?.length
          ? selectedDeposit.slips
          : selectedDeposit.slip?.url
            ? [selectedDeposit.slip]
            : [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Deposit Details</h3>
                <button
                  type="button"
                  onClick={() => setSelectedDeposit(null)}
                  className="p-1 rounded hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-500">Delivery Boy</div>
                    <div className="font-medium">{selectedDeposit.deliveryId?.name || "Unknown"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Phone/Email</div>
                    <div className="font-medium">{selectedDeposit.deliveryId?.phone || selectedDeposit.deliveryId?.email || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Amount</div>
                    <div className="font-medium">â‚¹ {Number(selectedDeposit.amount || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Cash In Hand (submit)</div>
                    <div className="font-medium">â‚¹ {Number(selectedDeposit.metadata?.cashInHandAtSubmit || selectedDeposit.metadata?.get?.("cashInHandAtSubmit") || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Status</div>
                    <div className="font-medium capitalize">{selectedDeposit.status}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Submitted</div>
                    <div className="font-medium">{new Date(selectedDeposit.submittedAt || selectedDeposit.createdAt).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Txn</div>
                    <div className="font-medium">{selectedDeposit.transactionId ? String(selectedDeposit.transactionId) : "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Rejection Reason</div>
                    <div className="font-medium text-rose-600">{selectedDeposit.rejectionReason || "-"}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-2">Slips</div>
                  {slips.length ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {slips.map((s, idx) => (
                        <a
                          key={`${s.url || idx}`}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded border overflow-hidden hover:shadow"
                        >
                          <img src={s.url} alt={`Slip ${idx + 1}`} className="w-full h-28 object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">No slips uploaded.</div>
                  )}
                </div>
              </div>
              <div className="border-t px-4 py-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedDeposit(null)}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {rejectingDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Reject Deposit</h3>
              <button
                type="button"
                onClick={() => setRejectingDeposit(null)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm text-slate-600">
                Delivery Boy: <span className="font-medium">{rejectingDeposit.deliveryId?.name || "Unknown"}</span>
              </div>
              <textarea
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                placeholder="Reason for rejection"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="border-t px-4 py-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingDeposit(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReject}
                className="px-4 py-2 text-sm rounded-lg bg-rose-600 text-white"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



