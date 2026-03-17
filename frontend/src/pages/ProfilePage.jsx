import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Page, SectionHeader } from '../components/ui/index'
import { authApi } from '../utils/api'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const [form, setForm] = useState({
    name: user?.name || '', phone: user?.phone || '', designation: user?.designation || ''
  })
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  const handleProfile = async () => {
    setSaving(true)
    try {
      await authApi.updateProfile(form)
      updateUser(form)
      toast.success('Profile updated')
    } catch { toast.error('Failed to update') }
    finally { setSaving(false) }
  }

  const handlePassword = async () => {
    if (pwForm.new_password !== pwForm.confirm) { toast.error('Passwords do not match'); return }
    setSaving(true)
    try {
      await authApi.changePassword({ current_password: pwForm.current_password, new_password: pwForm.new_password })
      toast.success('Password changed')
      setPwForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <Page>
      <SectionHeader title="My Profile" />
      <div className="max-w-lg space-y-6">
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">Personal Information</h2>
          {[['Full Name', 'name'], ['Phone', 'phone'], ['Designation', 'designation']].map(([label, key]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input className="input" value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
            </div>
          ))}
          <div><label className="label">Email (read-only)</label><input className="input bg-gray-50" value={user?.email || ''} readOnly /></div>
          <div><label className="label">Role</label><input className="input bg-gray-50 capitalize" value={(user?.role || '').replace(/_/g, ' ')} readOnly /></div>
          <button className="btn-primary" onClick={handleProfile} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
          </button>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">Change Password</h2>
          {[['Current Password', 'current_password'], ['New Password', 'new_password'], ['Confirm New Password', 'confirm']].map(([label, key]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input className="input" type="password" value={pwForm[key]} onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))} />
            </div>
          ))}
          <button className="btn-primary" onClick={handlePassword} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Change Password
          </button>
        </div>
      </div>
    </Page>
  )
}
