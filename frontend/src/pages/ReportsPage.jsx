import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clientsApi, usersApi } from '../utils/api'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { KpiCard, StatusBadge, PageLoader, Page, SectionHeader, EmptyState } from '../components/ui/index'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import {
  BarChart3, Download, Printer, Calendar, Users, Network,
  Ticket, ShoppingCart, Building2, Filter, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Clock, TrendingUp,
  FileText, ChevronDown
} from 'lucide-react'
import { format, startOfMonth, subMonths, subDays, startOfWeek } from 'date-fns'
import clsx from 'clsx'

const PIE_COLORS = ['#70AD47','#ED7D31','#C00000','#2E75B6','#7030A0','#17A589']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const REPORT_TYPES = [
  { id:'summary',     label:'Summary',     icon:BarChart3,    desc:'Overall KPIs and activity' },
  { id:'weekly',      label:'Weekly',      icon:Calendar,     desc:'Day-by-day this week' },
  { id:'monthly',     label:'Monthly',     icon:TrendingUp,   desc:'Week-by-week this month' },
  { id:'technician',  label:'Technician',  icon:Users,        desc:'Per-technician performance' },
  { id:'department',  label:'Department',  icon:Building2,    desc:'Deep dive by department' },
  { id:'network',     label:'Network',     icon:Network,      desc:'Network points' },
  { id:'tickets',     label:'Tickets',     icon:Ticket,       desc:'Tickets and SLA' },
  { id:'procurement', label:'Procurement', icon:ShoppingCart, desc:'Requests and costs' },
]

const fmt  = (n,d=0) => Number(n||0).toLocaleString('en',{minimumFractionDigits:d,maximumFractionDigits:d})
const curr = n => `KES ${fmt(n)}`
const todayStr      = () => format(new Date(),'yyyy-MM-dd')
const monthStartStr = () => format(startOfMonth(new Date()),'yyyy-MM-dd')
function getCurrentWeek() {
  const d=new Date(); d.setHours(0,0,0,0)
  d.setDate(d.getDate()+3-(d.getDay()+6)%7)
  const w=new Date(d.getFullYear(),0,4)
  return 1+Math.round(((d.getTime()-w.getTime())/86400000-3+(w.getDay()+6)%7)/7)
}

function Section({ title, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function ReportsPage() {
  const { user } = useAuth()
  const isClient = user?.role === 'client'
  const [reportType,setReportType] = useState('summary')
  const [dateFrom,setDateFrom]     = useState(monthStartStr())
  const [dateTo,setDateTo]         = useState(todayStr())
  const [clientId,setClientId]     = useState('')
  const [techId,setTechId]         = useState('')
  const [deptId,setDeptId]         = useState('')
  const [weekNum,setWeekNum]       = useState(getCurrentWeek())
  const [month,setMonth]           = useState(new Date().getMonth()+1)
  const [year,setYear]             = useState(new Date().getFullYear())
  const [sections,setSections]     = useState({kpis:true,chart:true,departments:true,details:true,trend:true})

  const { data:clients }     = useQuery({ queryKey:['clients'],     queryFn:()=>clientsApi.list().then(r=>r.data), enabled:!isClient })
  const { data:technicians } = useQuery({ queryKey:['techs'],       queryFn:()=>usersApi.list().then(r=>r.data.filter(u=>u.role==='technician')), enabled:!isClient&&reportType==='technician' })
  const { data:depts }       = useQuery({ queryKey:['depts',clientId], queryFn:()=>clientsApi.depts(clientId||1).then(r=>r.data), enabled:reportType==='department' })

  const qParams = () => {
    const p = {}
    if (!isClient && clientId) p.client_id = clientId
    if (!['weekly','monthly'].includes(reportType)) { p.date_from=dateFrom; p.date_to=dateTo }
    if (reportType==='weekly')     { p.year=year; p.week=weekNum }
    if (reportType==='monthly')    { p.year=year; p.month=month }
    if (reportType==='technician') p.technician_id=techId
    if (reportType==='department') p.department_id=deptId
    return p
  }

  const { data:report, isLoading, refetch } = useQuery({
    queryKey: ['report',reportType,dateFrom,dateTo,clientId,techId,deptId,weekNum,month,year],
    queryFn:  () => api.get(`/reports/${reportType}`,{params:qParams()}).then(r=>r.data),
  })

  const exportCSV = (type) => {
    const p = new URLSearchParams({type,date_from:dateFrom,date_to:dateTo})
    if (clientId) p.set('client_id',clientId)
    const token = localStorage.getItem('token')
    const base  = import.meta.env.VITE_API_URL||'http://localhost:5000'
    fetch(`${base}/api/reports/export/csv?${p}`,{headers:{Authorization:`Bearer ${token}`}})
      .then(r=>r.blob()).then(blob=>{
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob)
        a.download=`report-${type}-${dateFrom}.csv`; a.click()
      })
  }

  const presets = [
    {label:'Today',      f:todayStr(),                             t:todayStr()},
    {label:'This Week',  f:format(startOfWeek(new Date()),'yyyy-MM-dd'), t:todayStr()},
    {label:'This Month', f:monthStartStr(),                        t:todayStr()},
    {label:'Last Month', f:format(startOfMonth(subMonths(new Date(),1)),'yyyy-MM-dd'), t:format(new Date(new Date().getFullYear(),new Date().getMonth(),0),'yyyy-MM-dd')},
    {label:'Last 90d',   f:format(subDays(new Date(),90),'yyyy-MM-dd'), t:todayStr()},
  ]

  const kpis   = report?.kpis || {}
  const byDept = report?.by_department || []
  const pieData= byDept.slice(0,6).map(d=>({name:d.department,value:parseInt(d.total)||0})).filter(d=>d.value>0)
  const current= REPORT_TYPES.find(r=>r.id===reportType)

  return (
    <Page>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">{current?.desc}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={()=>window.print()} className="btn-secondary text-xs"><Printer className="w-3.5 h-3.5"/> Print</button>
          <div className="relative group">
            <button className="btn-secondary text-xs flex items-center gap-1"><Download className="w-3.5 h-3.5"/> Export CSV <ChevronDown className="w-3 h-3"/></button>
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 w-44 py-1 hidden group-hover:block">
              {[['issues','Issues'],['tickets','Tickets'],['network','Network'],['procurement','Procurement']].map(([v,l])=>(
                <button key={v} onClick={()=>exportCSV(v)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{l}</button>
              ))}
            </div>
          </div>
          <button onClick={()=>refetch()} className="btn-secondary text-xs"><RefreshCw className="w-3.5 h-3.5"/></button>
        </div>
      </div>

      {/* Report type tabs */}
      <div className="flex gap-2 flex-wrap">
        {REPORT_TYPES.map(rt=>(
          <button key={rt.id} onClick={()=>setReportType(rt.id)}
            className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all',
              reportType===rt.id?'bg-blue-600 border-blue-600 text-white':'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}>
            <rt.icon className="w-3.5 h-3.5"/> {rt.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3"><Filter className="w-4 h-4 text-gray-400"/><span className="text-sm font-semibold text-gray-700">Filters</span></div>
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-1 flex-wrap">
            {presets.map(p=>(
              <button key={p.label} onClick={()=>{setDateFrom(p.f);setDateTo(p.t)}}
                className={clsx('text-xs px-2.5 py-1.5 rounded-lg border',dateFrom===p.f&&dateTo===p.t?'bg-blue-50 border-blue-400 text-blue-700':'border-gray-200 text-gray-600')}>
                {p.label}
              </button>
            ))}
          </div>
          {!['weekly','monthly'].includes(reportType)&&(
            <>
              <div><label className="label">From</label><input type="date" className="input text-xs" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
              <div><label className="label">To</label><input type="date" className="input text-xs" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div>
            </>
          )}
          {reportType==='weekly'&&(
            <>
              <div><label className="label">Year</label><select className="input bg-white text-xs" value={year} onChange={e=>setYear(e.target.value)}>{[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}</select></div>
              <div><label className="label">Week</label><select className="input bg-white text-xs" value={weekNum} onChange={e=>setWeekNum(e.target.value)}>{Array.from({length:53},(_,i)=><option key={i+1} value={i+1}>Week {i+1}</option>)}</select></div>
            </>
          )}
          {reportType==='monthly'&&(
            <>
              <div><label className="label">Month</label><select className="input bg-white text-xs" value={month} onChange={e=>setMonth(e.target.value)}>{MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}</select></div>
              <div><label className="label">Year</label><select className="input bg-white text-xs" value={year} onChange={e=>setYear(e.target.value)}>{[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}</select></div>
            </>
          )}
          {!isClient&&(<div><label className="label">Client</label><select className="input bg-white text-xs" value={clientId} onChange={e=>setClientId(e.target.value)}><option value="">All</option>{clients?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>)}
          {reportType==='technician'&&!isClient&&(<div><label className="label">Technician</label><select className="input bg-white text-xs" value={techId} onChange={e=>setTechId(e.target.value)}><option value="">All</option>{technicians?.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>)}
          {reportType==='department'&&(<div><label className="label">Department</label><select className="input bg-white text-xs" value={deptId} onChange={e=>setDeptId(e.target.value)}><option value="">All</option>{depts?.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>)}
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Show sections:</span>
          {Object.entries(sections).map(([k,v])=>(
            <button key={k} onClick={()=>setSections(p=>({...p,[k]:!p[k]}))}
              className={clsx('text-xs px-2.5 py-1 rounded-lg border capitalize',v?'bg-blue-50 border-blue-300 text-blue-700':'border-gray-200 text-gray-400')}>{k}</button>
          ))}
        </div>
      </div>

      {/* Report output */}
      {isLoading ? <PageLoader/> : !report ? <EmptyState icon={BarChart3} title="No data" message="Adjust filters"/> : (
        <div className="space-y-6">
          {/* KPIs */}
          {sections.kpis && kpis.total_issues!==undefined && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard label="Total Issues"  value={fmt(kpis.total_issues)}   icon={FileText}      iconBg="bg-blue-600"/>
              <KpiCard label="Resolved"      value={fmt(kpis.resolved)}       icon={CheckCircle}   iconBg="bg-green-600" sub={kpis.resolution_rate?`${kpis.resolution_rate}% rate`:undefined}/>
              <KpiCard label="Critical"      value={fmt(kpis.critical)}       icon={AlertTriangle} iconBg="bg-red-600"/>
              <KpiCard label="Parts Cost"    value={curr(kpis.total_parts_cost)} icon={ShoppingCart} iconBg="bg-purple-600"/>
            </div>
          )}
          {sections.kpis && kpis.total!==undefined && reportType==='tickets' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard label="Total Tickets" value={fmt(kpis.total)}   icon={Ticket}        iconBg="bg-blue-600"/>
              <KpiCard label="Open"          value={fmt(kpis.open)}    icon={FileText}      iconBg="bg-orange-500"/>
              <KpiCard label="Closed"        value={fmt(kpis.closed)}  icon={CheckCircle}   iconBg="bg-green-600" sub={kpis.close_rate?`${kpis.close_rate}%`:undefined}/>
              <KpiCard label="Critical"      value={fmt(kpis.critical)}icon={AlertTriangle} iconBg="bg-red-600"/>
            </div>
          )}
          {sections.kpis && report.summary && reportType==='procurement' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard label="Total Requests" value={fmt(report.summary.total)}         icon={ShoppingCart} iconBg="bg-blue-600"/>
              <KpiCard label="Pending"        value={fmt(report.summary.pending)}        icon={Clock}        iconBg="bg-orange-500"/>
              <KpiCard label="Est. Cost"      value={curr(report.summary.total_estimated_cost)} icon={BarChart3} iconBg="bg-purple-600"/>
              <KpiCard label="Completed"      value={fmt(report.summary.completed)}      icon={CheckCircle}  iconBg="bg-green-600"/>
            </div>
          )}
          {sections.kpis && report.summary && reportType==='network' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard label="Total Points" value={fmt(report.summary.total_points)} icon={Network}       iconBg="bg-blue-600"/>
              <KpiCard label="Active"       value={fmt(report.summary.active)}       icon={CheckCircle}   iconBg="bg-green-600"/>
              <KpiCard label="Dead/Issues"  value={fmt(report.summary.dead)}         icon={XCircle}       iconBg="bg-red-600"/>
              <KpiCard label="With Issues"  value={fmt(report.summary.with_issues)}  icon={AlertTriangle} iconBg="bg-orange-500"/>
            </div>
          )}

          {/* Charts */}
          {sections.chart && byDept.length>0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Section title="Issues by Department">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={byDept.slice(0,10)} margin={{left:-20}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="department" tick={{fontSize:10}}/>
                      <YAxis tick={{fontSize:10}}/>
                      <Tooltip/>
                      <Bar dataKey="total"    fill="#2E75B6" radius={[4,4,0,0]} name="Total"/>
                      <Bar dataKey="resolved" fill="#70AD47" radius={[4,4,0,0]} name="Resolved"/>
                      <Legend iconType="circle" iconSize={8}/>
                    </BarChart>
                  </ResponsiveContainer>
                </Section>
              </div>
              {pieData.length>0 && (
                <Section title="Distribution">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                        {pieData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                      </Pie>
                      <Tooltip/><Legend iconType="circle" iconSize={8}/>
                    </PieChart>
                  </ResponsiveContainer>
                </Section>
              )}
            </div>
          )}

          {/* Trend line */}
          {sections.trend && (report.daily||report.weekly_trend) && (
            <Section title={report.daily?'Daily Trend (This Week)':'Weekly Trend'}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={report.daily||report.weekly_trend} margin={{left:-20}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey={report.daily?'day_name':'week_start'} tick={{fontSize:10}}/>
                  <YAxis tick={{fontSize:10}}/>
                  <Tooltip/>
                  <Line type="monotone" dataKey="total"    stroke="#2E75B6" strokeWidth={2} name="Total"/>
                  <Line type="monotone" dataKey="resolved" stroke="#70AD47" strokeWidth={2} name="Resolved"/>
                  <Legend iconType="circle" iconSize={8}/>
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}

          {/* Dept table */}
          {sections.departments && byDept.length>0 && (
            <Section title="Department Breakdown">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100">{['Department','Total','Resolved','Unresolved','Critical','Parts Cost','Avg Hrs'].map(h=><th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {byDept.map((d,i)=>(
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium flex items-center gap-2">{d.color&&<span className="w-2.5 h-2.5 rounded-full" style={{background:d.color}}/>}{d.department||'Unknown'}</td>
                        <td className="px-3 py-2 font-bold text-blue-600">{d.total}</td>
                        <td className="px-3 py-2 text-green-600">{d.resolved||0}</td>
                        <td className="px-3 py-2 text-red-600">{d.unresolved||0}</td>
                        <td className="px-3 py-2 text-red-500">{d.critical||0}</td>
                        <td className="px-3 py-2 text-gray-500">{d.parts_cost?curr(d.parts_cost):'—'}</td>
                        <td className="px-3 py-2 text-gray-500">{d.avg_hours||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Technician table */}
          {reportType==='technician' && report.technicians?.length>0 && (
            <Section title="Technician Performance">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100">{['Name','Visits','Issues','Resolved','Rate','Avg Hrs','Last Visit'].map(h=><th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {report.technicians.map((t,i)=>(
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{t.name}</td>
                        <td className="px-3 py-2 font-bold text-blue-600">{t.total_visits}</td>
                        <td className="px-3 py-2">{t.total_issues}</td>
                        <td className="px-3 py-2 text-green-600">{t.resolved}</td>
                        <td className="px-3 py-2"><span className={clsx('font-medium',parseFloat(t.resolution_rate||0)>=80?'text-green-600':'text-orange-500')}>{t.resolution_rate||0}%</span></td>
                        <td className="px-3 py-2 text-gray-500">{t.avg_resolution_hrs||'—'}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs">{t.last_visit?format(new Date(t.last_visit),'d MMM yyyy'):'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Network points */}
          {reportType==='network' && report.points?.length>0 && sections.details && (
            <Section title={`Network Points (${report.points.length})`}>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white"><tr className="border-b">{['Point ID','Office','Dept','Device','Status','Issue'].map(h=><th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {report.points.map((p,i)=>(
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono font-bold text-blue-600">{p.point_id}</td>
                        <td className="px-3 py-2 text-xs">{p.office_room||'—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{p.dept_name||'—'}</td>
                        <td className="px-3 py-2 text-xs">{p.device_type||'—'}</td>
                        <td className="px-3 py-2"><span className="badge badge-gray text-xs capitalize">{p.port_status?.replace(/_/g,' ')}</span></td>
                        <td className="px-3 py-2 text-red-600 text-xs max-w-xs truncate">{p.issue||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}
    </Page>
  )
}
