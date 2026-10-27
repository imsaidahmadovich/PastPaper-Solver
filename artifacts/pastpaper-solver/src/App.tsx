"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  useAdminLogin, useAdminLogout, useCreatePaper, useDeletePaper, useGetAdminDashboard,
  useGetAdminPaper, useGetAdminSession, useGetAiSettings, useGetPaper, useListAdminPapers,
  useListPapers, useProcessPaper, useSaveAiSettings, useSavePaperAssets,
  useSavePaperQuestions, useSubmitAttempt, useUpdatePaper, getGetAdminSessionQueryKey,
  getGetAdminDashboardQueryKey, getListAdminPapersQueryKey, getGetAdminPaperQueryKey,
  getGetAiSettingsQueryKey, getListPapersQueryKey,
  getGetPaperQueryKey,
} from '@workspace/api-client-react';
import type { AdminQuestion, PaperInput, QuestionInput } from '@workspace/api-client-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import {
  ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, ChevronDown, CircleHelp, Clock3,
  FileText, Filter, Flag, LockKeyhole, LogOut, Moon, Plus, Search, Settings2,
  ShieldCheck, Sun, Trash2, UploadCloud, X,
} from 'lucide-react';

const queryClient = new QueryClient();
const inputClass = 'field';
const btn = 'button';
const primary = 'button button-primary';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const idleForm = { title:'', subject:'', examBoard:'AQA', year:2024, session:'June', paperNumber:'1', timeLimitMinutes:90 };

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(localStorage.getItem('paper-theme') === 'dark');
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('paper-theme', dark ? 'dark' : 'light');
  }, [dark]);
  return <button className="icon-button" aria-label="Toggle dark mode" data-testid="button-theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>;
}

function Header({ admin = false }: { admin?: boolean }) {
  return <header className="topbar">
    <Link href="/" className="brand"><span className="brand-mark"><BookOpen size={17}/></span><span>pastpaper<span className="brand-dot">.</span></span></Link>
    <div className="topbar-right"><span className="topbar-note">{admin ? 'ADMIN WORKSPACE' : 'PRACTICE LIBRARY'}</span><ThemeToggle/>{admin ? <Link href="/admin" className="icon-button" aria-label="Admin overview"><Settings2 size={17}/></Link> : <Link href="/admin" className="admin-link"><LockKeyhole size={14}/> Admin</Link>}</div>
  </header>;
}

function Shell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return <div className="app-shell"><Header admin={admin}/>{children}<footer className="site-footer"><span>PASTPAPER SOLVER</span><span>Practice with purpose.</span><Link href="/admin">Administrator access</Link></footer></div>;
}

function HomePage() {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [year, setYear] = useState('');
  const params = useMemo(() => ({ search: search || undefined, subject: subject || undefined, year: year ? Number(year) : undefined }), [search, subject, year]);
  const { data: papers, isLoading, isError, error, refetch } = useListPapers(params, { query: { queryKey: getListPapersQueryKey(params) } });
  const subjects = Array.from(new Set((papers ?? []).map(p => p.subject))).sort();
  return <Shell><main className="library page-enter">
    <section className="library-intro">
      <div className="intro-copy"><div className="eyebrow"><span className="eyebrow-line"/>A BETTER WAY TO REVISE</div><h1 className="serif">The real paper.<br/><em>Your next step.</em></h1><p>Past exams, ready when you are. Find a paper, settle in, and see exactly where to focus next.</p></div>
      <aside className="intro-stamp"><span className="stamp-number">01</span><span>Choose<br/>your paper</span><span className="stamp-rule"/></aside>
      <div className="intro-decoration" aria-hidden="true"><div className="ring ring-one"/><div className="ring ring-two"/><span className="decoration-number">PAPER<br/>IN / OUT</span></div>
    </section>
    <section className="library-tools">
      <div className="section-heading"><div><span className="eyebrow">THE LIBRARY</span><h2>Published papers <span className="count-badge">{papers?.length ?? '—'}</span></h2></div><span className="results-caption">REAL EXAMS. CLEAR PROGRESS.</span></div>
      <div className="filter-bar"><label className="search-box"><Search size={18}/><input aria-label="Search papers" data-testid="input-search" placeholder="Search subjects, exam boards, years…" value={search} onChange={e=>setSearch(e.target.value)}/>{search && <button className="clear-search" onClick={()=>setSearch('')} aria-label="Clear search"><X size={15}/></button>}</label>
        <label className="select-wrap"><Filter size={15}/><select aria-label="Filter by subject" data-testid="select-subject" value={subject} onChange={e=>setSubject(e.target.value)}><option value="">All subjects</option>{subjects.map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={15}/></label>
        <label className="select-wrap year-select"><select aria-label="Filter by year" data-testid="select-year" value={year} onChange={e=>setYear(e.target.value)}><option value="">Any year</option>{Array.from({length:12},(_,i)=>new Date().getFullYear()-i).map(y=><option key={y}>{y}</option>)}</select><ChevronDown size={15}/></label>
      </div>
      {isLoading ? <div className="paper-grid">{[0,1,2].map(i=><div className="paper-skeleton" key={i}><div/><div/><div/></div>)}</div> : isError ? <div className="state-panel"><CircleHelp/><h3>We couldn’t load the library</h3><p>{errorText(error)}</p><button className={btn} onClick={()=>refetch()}>Try again</button></div> : papers?.length ? <div className="paper-grid">{papers.map((paper,index)=><Link key={paper.id} href={`/papers/${paper.id}`} className="paper-card" data-testid={`card-paper-${paper.id}`}><div className="paper-card-top"><span className="paper-type"><FileText size={14}/> EXAM PAPER</span><span className="paper-card-index">{String(index+1).padStart(2,'0')}</span></div><h3>{paper.title}</h3><p className="paper-subject">{paper.subject}</p><div className="paper-meta"><span>{paper.examBoard}</span><span>{paper.year} · {paper.session}</span><span>Paper {paper.paperNumber}</span></div><div className="paper-card-bottom"><span>{paper.questionCount} questions <i/> {paper.totalMarks} marks</span><span className="card-arrow"><ArrowRight size={17}/></span></div></Link>)}</div> : <div className="empty-panel"><div className="empty-icon"><Search/></div><h3>No papers found</h3><p>Try a different search or clear your filters.</p><button className={btn} onClick={()=>{setSearch('');setSubject('');setYear('');}}>Clear filters</button></div>}
    </section>
  </main></Shell>;
}

function PaperPage() {
  const { paperId = '' } = useParams<{paperId:string}>();
  const { data: paper, isLoading, isError, error, refetch } = useGetPaper(paperId, { query: { queryKey:getGetPaperQueryKey(paperId), enabled:!!paperId } });
  const submit = useSubmitAttempt();
  const [started,setStarted] = useState(false), [timed,setTimed] = useState(true), [answers,setAnswers] = useState<Record<string,string>>({});
  const [flagged,setFlagged] = useState<string[]>([]), [active,setActive] = useState(0), [seconds,setSeconds] = useState(0);
  const autoSubmitted = useRef(false);
  const [result,setResult] = useState<Awaited<ReturnType<typeof submit.mutateAsync>> | null>(null), [confirm,setConfirm] = useState(false);
  const storageKey = `pastpaper-attempt-${paperId}`;
  useEffect(()=>{ if(!paper) return; try {const saved=localStorage.getItem(storageKey);if(saved){const state=JSON.parse(saved);setAnswers(state.answers ?? {});setFlagged(state.flagged ?? []);setSeconds(state.seconds ?? 0);setTimed(state.timed ?? true);}} catch { /* ignore malformed local draft */} },[paper,storageKey]);
  useEffect(()=>{if(!started||result)return;const timer=window.setInterval(()=>setSeconds(s=>s+1),1000);return()=>window.clearInterval(timer);},[started,result]);
  useEffect(()=>{if(started&&!result) localStorage.setItem(storageKey,JSON.stringify({answers,flagged,seconds,timed}));},[started,result,answers,flagged,seconds,timed,storageKey]);
  const timeLimitSeconds = paper?.timeLimitMinutes ? paper.timeLimitMinutes * 60 : 0;
  const remainingSeconds = Math.max(0, timeLimitSeconds - seconds);
  const clockSeconds = timed && timeLimitSeconds ? remainingSeconds : seconds;
  const clockText = `${Math.floor(clockSeconds/3600).toString().padStart(2,'0')}:${Math.floor(clockSeconds%3600/60).toString().padStart(2,'0')}:${(clockSeconds%60).toString().padStart(2,'0')}`;
  const elapsed = `${Math.floor(seconds/3600).toString().padStart(2,'0')}:${Math.floor(seconds%3600/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
  useEffect(()=>{
    if(!paper||!started||!timed||!timeLimitSeconds||seconds<timeLimitSeconds||result||autoSubmitted.current)return;
    autoSubmitted.current=true;
    submit.mutate({paperId,data:{answers:paper.questions.map(q=>({questionId:q.id,answer:answers[q.id]??''})),durationSeconds:seconds,timed}},{onSuccess:r=>{setResult(r);setConfirm(false);localStorage.removeItem(storageKey);}});
  },[paper,started,timed,timeLimitSeconds,seconds,result,submit,paperId,answers,storageKey]);
  if(isLoading)return <Shell><main className="content-width"><div className="detail-skeleton"/></main></Shell>;
  if(isError||!paper)return <Shell><main className="content-width"><div className="state-panel"><CircleHelp/><h3>Paper unavailable</h3><p>{errorText(error)}</p><button className={btn} onClick={()=>refetch()}>Retry</button><Link className={btn} href="/">Back to library</Link></div></main></Shell>;
  const question=paper.questions[active];
  const finish=()=>submit.mutate({paperId,data:{answers:paper.questions.map(q=>({questionId:q.id,answer:answers[q.id]??''})),durationSeconds:seconds,timed}},{onSuccess:r=>{setResult(r);setConfirm(false);localStorage.removeItem(storageKey);}});
  return <Shell><main className="content-width page-enter">
    {!started ? <><Link className="back-link" href="/"><ArrowLeft size={15}/> Back to papers</Link><section className="paper-detail-hero"><div className="eyebrow"><span className="eyebrow-line"/>READY WHEN YOU ARE</div><h1 className="serif">{paper.title}</h1><p className="paper-detail-sub">{paper.subject} <span>·</span> {paper.examBoard} <span>·</span> {paper.year} / {paper.session}</p><div className="detail-stats"><div><span>QUESTIONS</span><strong>{paper.questions.length}</strong></div><div><span>TIME ALLOWED</span><strong>{paper.timeLimitMinutes ? `${paper.timeLimitMinutes} min` : 'Untimed'}</strong></div><div><span>PAPER</span><strong>{paper.paperNumber}</strong></div></div></section>
      <section className="start-panel"><div><span className="eyebrow">SET YOUR PACE</span><h2>How would you like to practise?</h2><p>Choose a timed run for exam conditions, or work at your own pace.</p></div><div className="mode-choice"><button className={`mode-card ${timed?'selected':''}`} onClick={()=>setTimed(true)}><Clock3/><strong>Timed</strong><span>{paper.timeLimitMinutes ? `${paper.timeLimitMinutes} minutes` : 'Track your time'}</span></button><button className={`mode-card ${!timed?'selected':''}`} onClick={()=>setTimed(false)}><Bookmark/><strong>Untimed</strong><span>Take the time you need</span></button></div><button className={`${primary} start-button`} onClick={()=>setStarted(true)}>Start paper <ArrowRight size={17}/></button></section></>
      : result ? <Results result={result} paperTitle={paper.title}/> : <><div className="exam-top"><Link href="/" className="exam-brand"><BookOpen size={17}/> {paper.title}</Link><div className="exam-status"><span className="save-status"><span/> Draft saved locally</span>{timed&&<span className="timer"><Clock3 size={15}/>{clockText}</span>}<button className="button submit-top" onClick={()=>setConfirm(true)}>Submit paper</button></div></div>
      <div className="exam-layout"><aside className="question-nav"><span className="eyebrow">QUESTION NAVIGATION</span><div className="question-dots">{paper.questions.map((q,i)=><button key={q.id} className={`question-dot ${i===active?'current':''} ${answers[q.id]?.trim()?'answered':''} ${flagged.includes(q.id)?'is-flagged':''}`} aria-label={`Go to question ${q.questionNumber}`} onClick={()=>setActive(i)}>{q.questionNumber}</button>)}</div><div className="nav-legend"><span><i className="legend-current"/>Current</span><span><i className="legend-answered"/>Answered</span><span><i className="legend-flagged"/>Flagged</span></div><button className="button button-quiet nav-submit" onClick={()=>setConfirm(true)}>Review & submit <ArrowRight size={15}/></button></aside>
        <section className="question-area"><div className="question-progress"><span>QUESTION {String(active+1).padStart(2,'0')} <i>/</i> {String(paper.questions.length).padStart(2,'0')}</span><div><span style={{width:`${((active+1)/paper.questions.length)*100}%`}}/></div><button className={`flag-button ${flagged.includes(question.id)?'flagged':''}`} onClick={()=>setFlagged(f=>f.includes(question.id)?f.filter(id=>id!==question.id):[...f,question.id])}><Flag size={15}/>{flagged.includes(question.id)?'Flagged':'Flag for review'}</button></div>
          <article className="question-sheet"><div className="question-number">{question.questionNumber}</div><div className="question-body"><p>{question.text}</p>{question.kind==='mcq'&&question.options.length>0?<div className="options-list">{question.options.map((option,i)=><label className={`option-row ${answers[question.id]===option?'chosen':''}`} key={i}><input type="radio" name={`q-${question.id}`} checked={answers[question.id]===option} onChange={()=>setAnswers(a=>({...a,[question.id]:option}))}/><span className="option-letter">{String.fromCharCode(65+i)}</span>{option}</label>)}</div>:<textarea className="answer-area" placeholder="Write your answer here…" value={answers[question.id]??''} onChange={e=>setAnswers(a=>({...a,[question.id]:e.target.value}))} aria-label={`Answer for question ${question.questionNumber}`} data-testid={`input-answer-${question.id}`}/>}</div></article>
          <div className="question-controls"><button className={btn} onClick={()=>setActive(Math.max(0,active-1))} disabled={active===0}><ArrowLeft size={16}/> Previous</button><span className="autosave-caption">Your answers save on this device</span>{active<paper.questions.length-1?<button className={primary} onClick={()=>setActive(active+1)}>Next question <ArrowRight size={16}/></button>:<button className={primary} onClick={()=>setConfirm(true)}>Review & submit <ArrowRight size={16}/></button>}</div>
        </section></div>{confirm&&<div className="modal-backdrop"><section className="confirm-modal"><button className="modal-x" onClick={()=>setConfirm(false)} aria-label="Close"><X/></button><div className="modal-icon"><Check/></div><h2 className="serif">Ready to hand in?</h2><p>You’ve answered {paper.questions.filter(q=>answers[q.id]?.trim()).length} of {paper.questions.length} questions. You can’t change your answers after submitting.</p><div className="modal-actions"><button className={btn} onClick={()=>setConfirm(false)}>Keep working</button><button className={primary} disabled={submit.isPending} onClick={finish}>{submit.isPending?'Submitting…':'Submit paper'}</button></div>{submit.isError&&<p className="error-message">{errorText(submit.error)}</p>}</section></div>}</>}
  </main></Shell>;
}

function Results({result,paperTitle}:{result:any;paperTitle:string}) {
  const pct=Math.round(result.percentage);
  return <section className="results-page"><Link className="back-link" href="/"><ArrowLeft size={15}/> Return to library</Link><div className="result-heading"><span className="eyebrow"><span className="eyebrow-line"/>ATTEMPT COMPLETE</span><h1 className="serif">A solid effort.<br/><em>Now make it count.</em></h1><p>{paperTitle} · submitted {new Date(result.submittedAt).toLocaleString()}</p></div><div className="score-panel"><div className="score-main"><span className="eyebrow">YOUR SCORE</span><strong>{result.totalMarks}<small> / {result.maxMarks}</small></strong><div className="score-track"><i style={{width:`${pct}%`}}/></div><span>{pct}% overall</span></div><div className="score-side"><div><span>TIME SPENT</span><strong>{Math.floor(result.timeTakenSeconds/60)} min</strong></div><div><span>QUESTIONS REVIEWED</span><strong>{result.questions.length}</strong></div></div></div><div className="review-heading"><div><span className="eyebrow">REVIEW YOUR ANSWERS</span><h2>What to take forward</h2></div><span className="review-note">Answers and marking guidance are shown only after submission.</span></div><div className="review-list">{result.questions.map((q:any,i:number)=><article className="review-card" key={q.questionId}><div className="review-card-head"><span>QUESTION {q.questionNumber}</span><span className={`mark-chip ${q.marksAwarded===q.maxMarks?'mark-full':''}`}>{q.marksAwarded} / {q.maxMarks} marks</span></div><h3>{q.questionText}</h3><div className="answer-review"><div><span className="eyebrow">YOUR ANSWER</span><p>{q.userAnswer||'No answer submitted.'}</p></div><div><span className="eyebrow">MARK SCHEME</span><p>{q.correctAnswer||'No model answer provided.'}</p>{q.markingPoints?.length>0&&<ul>{q.markingPoints.map((point:string,j:number)=><li key={j}>{point}</li>)}</ul>}</div></div>{q.explanation&&<div className="feedback-note"><Check size={15}/>{q.explanation}</div>}</article>)}</div></section>;
}

function AdminLogin({onSuccess}:{onSuccess:()=>void}) {
  const login=useAdminLogin();const[password,setPassword]=useState('');
  return <div className="login-wrap"><section className="login-card"><div className="login-symbol"><ShieldCheck/></div><span className="eyebrow">RESTRICTED AREA</span><h1 className="serif">Administrator<br/>sign in</h1><p>Manage papers and exam settings for PastPaper Solver.</p><form onSubmit={e=>{e.preventDefault();login.mutate({data:{password}},{onSuccess});}}><label className="form-label">Admin password<input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required data-testid="input-admin-password"/></label>{login.isError&&<p className="error-message">{errorText(login.error)}</p>}<button className={`${primary} full-button`} disabled={login.isPending}>{login.isPending?'Signing in…':'Sign in'} <ArrowRight size={16}/></button></form><Link className="back-link login-back" href="/"><ArrowLeft size={15}/> Return to paper library</Link></section></div>;
}

function AdminPage() {
  const qc=useQueryClient();const {data:session,isLoading:sessionLoading}=useGetAdminSession({query:{queryKey:getGetAdminSessionQueryKey(),retry:false}});
  const [loginSuccess,setLoginSuccess]=useState(false);
  const {data:dashboard,isLoading:dashLoading,isError:dashError,refetch:refetchDash}=useGetAdminDashboard({query:{queryKey:getGetAdminDashboardQueryKey(),enabled:!!session?.authenticated}});
  const {data:papers,isLoading:papersLoading,isError:papersError,refetch:refetchPapers}=useListAdminPapers({query:{queryKey:getListAdminPapersQueryKey(),enabled:!!session?.authenticated}});
  const {data:ai,isLoading:aiLoading}=useGetAiSettings({query:{queryKey:getGetAiSettingsQueryKey(),enabled:!!session?.authenticated}});
  const logout=useAdminLogout();const saveAi=useSaveAiSettings();const[provider,setProvider]=useState('openai'),[model,setModel]=useState('gpt-4o-mini'),[apiKey,setApiKey]=useState('');
  useEffect(()=>{if(ai){setProvider(ai.provider);setModel(ai.model);}},[ai]);
  if(sessionLoading)return <Shell admin><main className="admin-content"><div className="detail-skeleton"/></main></Shell>;
  if(!session?.authenticated&&!loginSuccess)return <Shell admin><main className="admin-content"><AdminLogin onSuccess={()=>{setLoginSuccess(true);qc.invalidateQueries({queryKey:getGetAdminSessionQueryKey()});}}/></main></Shell>;
  return <Shell admin><main className="admin-content page-enter"><div className="admin-heading"><div><span className="eyebrow"><span className="eyebrow-line"/>CONTROL ROOM</span><h1 className="serif">Good work starts<br/>behind the scenes.</h1><p>Keep the library accurate, useful, and ready for the next student.</p></div><button className={btn} onClick={()=>logout.mutate(undefined,{onSuccess:()=>{setLoginSuccess(false);qc.setQueryData(getGetAdminSessionQueryKey(),{authenticated:false});qc.invalidateQueries({queryKey:getGetAdminSessionQueryKey()});}})}><LogOut size={15}/> Sign out</button></div>
    {dashError?<div className="inline-error">Dashboard unavailable. <button onClick={()=>refetchDash()}>Retry</button></div>:<div className="metric-row">{dashLoading?[0,1,2,3].map(i=><div className="metric-skeleton" key={i}/>):[['PAPERS IN LIBRARY',dashboard?.totalPapers??0],['PUBLISHED',dashboard?.publishedPapers??0],['STUDENT ATTEMPTS',dashboard?.totalAttempts??0],['AVERAGE SCORE',`${dashboard?.averageScore??0}%`]].map(([label,value])=><article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>}
    <div className="admin-grid"><section className="admin-panel papers-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h2>Paper management</h2></div><Link className={primary} href="/admin/papers/new"><Plus size={16}/> New paper</Link></div>{papersLoading?<div className="list-loading"><i/><i/><i/></div>:papersError?<div className="state-inline">Couldn’t load papers. <button onClick={()=>refetchPapers()}>Retry</button></div>:papers?.length?<div className="admin-paper-list">{papers.map(p=><div className="admin-paper-row" key={p.id}><div className="paper-icon"><FileText size={18}/></div><div className="admin-paper-title"><strong>{p.title}</strong><span>{p.subject} · {p.examBoard} · {p.year}</span></div><span className={`status-pill ${p.isPublished?'published':''}`}>{p.isPublished?'Published':'Draft'}</span><Link className="row-open" href={`/admin/papers/${p.id}`} aria-label={`Edit ${p.title}`}><ArrowRight size={17}/></Link></div>)}</div>:<div className="empty-inline"><FileText/><strong>Your paper library is empty</strong><span>Create a paper to begin building the collection.</span><Link href="/admin/papers/new" className={btn}>Create first paper</Link></div>}</section>
      <section className="admin-panel ai-panel"><div className="panel-heading"><div><span className="eyebrow">AUTOMATION</span><h2>AI settings</h2></div><span className={`connection-pill ${ai?.isConfigured?'connected':''}`}><i/>{ai?.isConfigured?'Configured':'Not configured'}</span></div><p className="panel-description">Choose the model used to help extract questions from uploaded papers. Your API key is never displayed.</p>{aiLoading?<div className="list-loading"><i/><i/></div>:<form className="ai-form" onSubmit={e=>{e.preventDefault();saveAi.mutate({data:{provider:provider as 'openai'|'anthropic'|'gemini',model,...(apiKey?{apiKey}:{})}},{onSuccess:()=>{setApiKey('');qc.invalidateQueries({queryKey:getGetAiSettingsQueryKey()});}});}}><label className="form-label">Provider<select className={inputClass} value={provider} onChange={e=>setProvider(e.target.value)}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Google Gemini</option></select></label><label className="form-label">Model<input className={inputClass} value={model} onChange={e=>setModel(e.target.value)} required placeholder="Model identifier"/></label><label className="form-label">API key <span className="optional">Optional · leave blank to keep current</span><input className={inputClass} type="password" autoComplete="new-password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={ai?.isConfigured?'Key securely stored':'Enter provider key'}/></label>{saveAi.isError&&<p className="error-message">{errorText(saveAi.error)}</p>}{saveAi.isSuccess&&<p className="success-message"><Check size={14}/> Settings saved</p>}<button className={btn} disabled={saveAi.isPending}>{saveAi.isPending?'Saving…':'Save AI settings'}</button></form>}</section></div>
  </main></Shell>;
}

function PaperForm({paperId}:{paperId?:string}) {
  const creating=!paperId;const qc=useQueryClient();const[,navigate]=useLocation();const create=useCreatePaper(),update=useUpdatePaper(),remove=useDeletePaper();
  const {data:paper,isLoading,isError,error,refetch}=useGetAdminPaper(paperId??'',{query:{queryKey:getGetAdminPaperQueryKey(paperId??''),enabled:!!paperId}});
  const[form,setForm]=useState<PaperInput>(idleForm);const[questions,setQuestions]=useState<AdminQuestion[]>([]);const[files,setFiles]=useState<{qp:File|null;ms:File|null}>({qp:null,ms:null});const[uploadBusy,setUploadBusy]=useState(false);const[message,setMessage]=useState('');
  const assets=useSavePaperAssets(),process=useProcessPaper(),saveQuestions=useSavePaperQuestions();
  useEffect(()=>{if(paper){setForm({title:paper.title,subject:paper.subject,examBoard:paper.examBoard,year:paper.year,session:paper.session,paperNumber:paper.paperNumber,timeLimitMinutes:paper.timeLimitMinutes});setQuestions(paper.questions);}},[paper]);
  const updateForm=(key:keyof PaperInput,value:string)=>setForm(f=>({...f,[key]:key==='year'?Number(value):key==='timeLimitMinutes'?(value===''?null:Number(value)):value}));
  if(paperId&&isLoading)return <Shell admin><main className="admin-content"><div className="detail-skeleton"/></main></Shell>;
  if(paperId&&(isError||!paper))return <Shell admin><main className="admin-content"><div className="state-panel"><CircleHelp/><h3>Paper could not be opened</h3><p>{errorText(error)}</p><button className={btn} onClick={()=>refetch()}>Retry</button></div></main></Shell>;
  const metadataFields:[keyof PaperInput,string,string][]=[['title','Paper title','e.g. GCSE Mathematics — Paper 1'],['subject','Subject','e.g. Mathematics'],['examBoard','Exam board','e.g. AQA'],['year','Year','2024'],['session','Session','June'],['paperNumber','Paper number','1']];
  const submitMeta=(e:FormEvent)=>{e.preventDefault();if(creating)create.mutate({data:form},{onSuccess:created=>{qc.invalidateQueries({queryKey:getListAdminPapersQueryKey()});navigate(`/admin/papers/${created.id}`);}});else update.mutate({paperId:paperId!,data:form},{onSuccess:()=>{qc.invalidateQueries({queryKey:getGetAdminPaperQueryKey(paperId!)});qc.invalidateQueries({queryKey:getListAdminPapersQueryKey()});setMessage('Paper details saved.');}});};
  const uploadAssets=async()=>{if(!files.qp||!files.ms||!paperId)return;setUploadBusy(true);setMessage('');try{
    const uploadOne=async(file:File,kind:'qp'|'ms')=>{const r=await fetch('/api/admin/blob-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paperId,kind,filename:file.name,contentType:file.type,size:file.size})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.url)throw new Error(d?.error||'Upload could not be authorized.');const form=new FormData();form.append('cacheControl','3600');form.append('',file);const put=await fetch(d.url,{method:'PUT',headers:{'x-upsert':'true'},body:form});if(!put.ok){const e=await put.json().catch(()=>null);throw new Error(e?.message||'File upload failed ('+put.status+').');}return d.pathname as string;};
    const [questionPaperPath,markSchemePath]=await Promise.all([uploadOne(files.qp,'qp'),uploadOne(files.ms,'ms')]);
    assets.mutate({paperId,data:{questionPaperPath,markSchemePath}},{onSuccess:()=>{setMessage('Both files uploaded and attached.');setFiles({qp:null,ms:null});qc.invalidateQueries({queryKey:getGetAdminPaperQueryKey(paperId)});},onError:e=>setMessage(errorText(e)),onSettled:()=>setUploadBusy(false)});
  }catch(e){setMessage(errorText(e));setUploadBusy(false);}};
  const processUploads=()=>process.mutate({paperId:paperId!},{onSuccess:async()=>{await qc.invalidateQueries({queryKey:getGetAdminPaperQueryKey(paperId!)});setMessage('Paper processed. Review the extracted questions below.');},onError:e=>setMessage(errorText(e))});
  const saveQs=()=>{const payload:QuestionInput[]=questions.map(({questionNumber,text,marks,kind,options,correctAnswer,markingPoints})=>({questionNumber,text,marks,kind,options,correctAnswer,markingPoints}));saveQuestions.mutate({paperId:paperId!,data:payload},{onSuccess:()=>{qc.invalidateQueries({queryKey:getGetAdminPaperQueryKey(paperId!)});setMessage('Questions and marking guidance saved.');},onError:e=>setMessage(errorText(e))});};
  const changeQuestion=(id:string,key:keyof AdminQuestion,value:string)=>setQuestions(qs=>qs.map(q=>q.id===id?{...q,[key]:key==='marks'?Number(value):value}:q));
  const togglePublish=()=>update.mutate({paperId:paperId!,data:{isPublished:!paper?.isPublished}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getGetAdminPaperQueryKey(paperId!)});qc.invalidateQueries({queryKey:getListAdminPapersQueryKey()});setMessage(paper?.isPublished?'Paper unpublished.':'Paper published to the library.');}});
  const deletePaper=()=>{if(!paperId||!window.confirm('Delete this paper and its questions? This cannot be undone.'))return;remove.mutate({paperId},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListAdminPapersQueryKey()});navigate('/admin');}});};
  return <Shell admin><main className="admin-content page-enter"><Link className="back-link" href="/admin"><ArrowLeft size={15}/> Admin overview</Link><div className="edit-heading"><div><span className="eyebrow">{creating?'NEW ENTRY':'PAPER EDITOR'}</span><h1 className="serif">{creating?'Add a paper':'Edit paper'}</h1><p>{creating?'Start with the details students will use to find this exam.':'Manage source files, extracted content, and publication.'}</p></div>{paperId&&<span className={`status-pill ${paper?.isPublished?'published':''}`}>{paper?.isPublished?'Published':'Draft'}</span>}</div>
    <section className="admin-panel form-panel"><div className="panel-heading"><div><span className="eyebrow">01 / METADATA</span><h2>Paper details</h2></div></div><form className="metadata-form" onSubmit={submitMeta}>{metadataFields.map(([key,label,placeholder])=><label className={`form-label ${key==='title'?'wide':''}`} key={key}>{label}<input className={inputClass} required type={key==='year'?'number':'text'} min={key==='year'?1900:undefined} max={key==='year'?2200:undefined} value={form[key] as string|number} placeholder={placeholder} onChange={e=>updateForm(key,e.target.value)}/></label>)}<label className="form-label">Time limit (minutes)<input className={inputClass} type="number" min="1" max="1440" value={form.timeLimitMinutes??''} placeholder="Optional" onChange={e=>updateForm('timeLimitMinutes',e.target.value)}/></label><div className="form-actions"><button className={primary} disabled={create.isPending||update.isPending}>{creating?(create.isPending?'Creating…':'Create paper'):update.isPending?'Saving…':'Save details'} <ArrowRight size={16}/></button>{(create.isError||update.isError)&&<span className="error-message">{errorText(create.error||update.error)}</span>}</div></form></section>
    {paperId&&<><section className="admin-panel form-panel"><div className="panel-heading"><div><span className="eyebrow">02 / SOURCE MATERIAL</span><h2>Question paper & mark scheme</h2></div></div><p className="panel-description">Upload source PDFs or images, then process them to extract editable questions and marking guidance.</p><div className="asset-status"><span className={paper?.hasQuestionPaper?'asset-ready':''}><FileText size={15}/>{paper?.hasQuestionPaper?'Question paper attached':'Question paper missing'}</span><span className={paper?.hasMarkScheme?'asset-ready':''}><FileText size={15}/>{paper?.hasMarkScheme?'Mark scheme attached':'Mark scheme missing'}</span></div><div className="upload-grid">{[['qp','Question paper'],['ms','Mark scheme']].map(([key,label])=><label className="upload-drop" key={key}><UploadCloud/><strong>{label}</strong><span>{files[key as 'qp'|'ms']?.name??'Choose a PDF or image'}</span><input type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp" onChange={e=>setFiles(f=>({...f,[key]:e.target.files?.[0]??null}))}/></label>)}</div><div className="asset-actions"><button className={btn} disabled={!files.qp||!files.ms||uploadBusy} onClick={uploadAssets}>{uploadBusy?'Uploading…':'Upload both files'}</button><button className={primary} disabled={!paper?.hasQuestionPaper||!paper?.hasMarkScheme||process.isPending} onClick={processUploads}>{process.isPending?'Processing…':'Process uploads'} <ArrowRight size={16}/></button></div>{process.isError&&<p className="error-message">{errorText(process.error)}</p>}</section>
      <section className="admin-panel form-panel"><div className="panel-heading"><div><span className="eyebrow">03 / EXTRACTED CONTENT</span><h2>Questions & answers</h2></div><button className={btn} onClick={()=>setQuestions(q=>[...q,{id:`local-${Date.now()}`,position:q.length,questionNumber:String(q.length+1),text:'',marks:1,kind:'written',options:[],correctAnswer:'',markingPoints:[]}])}><Plus size={15}/> Add question</button></div>{questions.length===0?<div className="empty-inline"><CircleHelp/><strong>No questions extracted yet</strong><span>Upload both source files and process them, or add a question manually.</span></div>:<div className="question-editor">{questions.map((q,index)=><article className="question-edit-card" key={q.id}><div className="question-edit-head"><span>QUESTION {String(index+1).padStart(2,'0')}</span><button className="icon-button danger-icon" aria-label="Remove question" onClick={()=>setQuestions(qs=>qs.filter(item=>item.id!==q.id))}><Trash2 size={15}/></button></div><div className="question-edit-fields"><label className="form-label">Number<input className={inputClass} value={q.questionNumber} onChange={e=>changeQuestion(q.id,'questionNumber',e.target.value)}/></label><label className="form-label">Marks<input className={inputClass} type="number" min="0" value={q.marks} onChange={e=>changeQuestion(q.id,'marks',e.target.value)}/></label><label className="form-label">Type<select className={inputClass} value={q.kind} onChange={e=>changeQuestion(q.id,'kind',e.target.value)}><option value="written">Written</option><option value="mcq">Multiple choice</option></select></label><label className="form-label full">Question text<textarea className={inputClass} rows={3} value={q.text} onChange={e=>changeQuestion(q.id,'text',e.target.value)}/></label>{q.kind==='mcq'&&<label className="form-label full">Options <span className="optional">One per line</span><textarea className={inputClass} rows={3} value={q.options.join('\n')} onChange={e=>setQuestions(qs=>qs.map(item=>item.id===q.id?{...item,options:e.target.value.split('\n')}:item))}/></label>}<label className="form-label full">Correct answer<textarea className={inputClass} rows={2} value={q.correctAnswer} onChange={e=>changeQuestion(q.id,'correctAnswer',e.target.value)}/></label><label className="form-label full">Marking points <span className="optional">One per line</span><textarea className={inputClass} rows={3} value={q.markingPoints.join('\n')} onChange={e=>setQuestions(qs=>qs.map(item=>item.id===q.id?{...item,markingPoints:e.target.value.split('\n')}:item))}/></label></div></article>)}</div>}<div className="form-actions"><button className={primary} disabled={!questions.length||saveQuestions.isPending} onClick={saveQs}>{saveQuestions.isPending?'Saving questions…':'Save questions & answers'} <Check size={16}/></button></div></section>
      <section className="publish-panel"><div><span className="eyebrow">READY FOR STUDENTS?</span><h2>{paper?.isPublished?'This paper is live in the library.':'Publish when the paper is ready.'}</h2><p>Students can only see published papers. Check the extracted questions before publishing.</p></div><button className={paper?.isPublished?btn:primary} onClick={togglePublish} disabled={update.isPending}>{update.isPending?'Saving…':paper?.isPublished?'Unpublish paper':'Publish paper'}</button></section><div className="delete-zone"><span>PERMANENT ACTION</span><button className="delete-button" onClick={deletePaper} disabled={remove.isPending}><Trash2 size={15}/>{remove.isPending?'Deleting…':'Delete paper'}</button></div></>}
    {message&&<div className="toast-message" role="status"><Check size={15}/>{message}<button onClick={()=>setMessage('')} aria-label="Dismiss"><X size={14}/></button></div>}
  </main></Shell>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={HomePage}/>
    <Route path="/papers/:paperId" component={PaperPage}/>
    <Route path="/admin/papers/new"><PaperForm/></Route>
    <Route path="/admin/papers/:paperId">{params=><PaperForm paperId={params.paperId}/>}</Route>
    <Route path="/admin" component={AdminPage}/>
    <Route><Shell><main className="content-width"><div className="state-panel"><h3>Page not found</h3><Link href="/" className={btn}>Return to library</Link></div></main></Shell></Route>
  </Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;
