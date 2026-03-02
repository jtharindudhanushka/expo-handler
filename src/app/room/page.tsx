"use client"
import { useState, useEffect } from "react"
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default function RoomDashboard() {
    const [companies, setCompanies] = useState<any[]>([])
    const [selectedCompany, setSelectedCompany] = useState<string>("")
    const [tickets, setTickets] = useState<any[]>([])
    const [candidates, setCandidates] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Fetch companies
    useEffect(() => {
        try {
            const unsub = onSnapshot(collection(db, "companies"), (snapshot) => {
                setCompanies(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
                setLoading(false)
            }, (err) => {
                console.error("Firestore error:", err)
                setError("Firestore Error: Please check your Firebase Security Rules (must be in Test Mode) or Vercel Environment Variables.")
                setLoading(false)
            })
            return () => unsub()
        } catch (e: any) {
            console.error(e)
            setError(e.message || "Firebase not configured.")
            setLoading(false)
        }
    }, [])

    // Fetch tickets for selected company
    useEffect(() => {
        if (!selectedCompany) {
            setTickets([])
            return
        }

        const q = query(
            collection(db, "queue_tickets"),
            where("company_id", "==", selectedCompany),
            where("status", "in", ["pending", "called", "interviewing"])
        )

        // Sort tickets manually on client based on timestamp to avoid needing a composite index for 'in' query
        const unsub = onSnapshot(q, (snapshot) => {
            const t = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
            t.sort((a: any, b: any) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0))
            setTickets(t)
        })
        return () => unsub()
    }, [selectedCompany])

    // Fetch all active candidates for global status monitoring
    useEffect(() => {
        const unsub = onSnapshot(collection(db, "candidates"), (snapshot) => {
            const cMap: Record<string, any> = {}
            snapshot.docs.forEach(d => {
                cMap[d.id] = { id: d.id, ...d.data() }
            })
            setCandidates(cMap)
        })
        return () => unsub()
    }, [])

    const handleCall = async (ticketId: string) => {
        await updateDoc(doc(db, "queue_tickets", ticketId), { status: "called" })
    }

    const handleStartInterview = async (ticketId: string, candidateId: string) => {
        await updateDoc(doc(db, "queue_tickets", ticketId), { status: "interviewing" })
        await updateDoc(doc(db, "candidates", candidateId), { status: "in_interview" })
    }

    const handleComplete = async (ticketId: string, candidateId: string) => {
        await updateDoc(doc(db, "queue_tickets", ticketId), { status: "completed" })
        await updateDoc(doc(db, "candidates", candidateId), { status: "waiting" })
    }

    const handleSkip = async (ticketId: string) => {
        await updateDoc(doc(db, "queue_tickets", ticketId), { status: "skipped" })
    }

    if (error) return <div className="p-8 text-center text-red-500 font-medium max-w-lg mx-auto mt-20">{error}</div>
    if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Loading Database Connection...</div>

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <Card className="shadow-md border-slate-200">
                    <CardHeader className="bg-white rounded-t-xl border-b border-slate-100">
                        <CardTitle className="text-xl md:text-2xl font-bold text-slate-900">Room Lead Dashboard</CardTitle>
                        <p className="text-sm text-slate-500">Select your room to manage your candidate queue.</p>
                    </CardHeader>
                    <CardContent className="pt-6 bg-slate-50/50 rounded-b-xl">
                        <select
                            className="w-full h-12 px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                            value={selectedCompany}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                        >
                            <option value="">-- Select Company / Room --</option>
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.room_number})</option>
                            ))}
                        </select>
                    </CardContent>
                </Card>

                {selectedCompany && (
                    <Card className="shadow-md border-slate-200">
                        <CardHeader className="bg-white rounded-t-xl border-b border-slate-100">
                            <CardTitle className="text-xl font-bold text-slate-900 flex items-center justify-between">
                                <span>Smart Queue</span>
                                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">{tickets.length} waiting</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 bg-slate-50/30">
                            {tickets.length === 0 ? (
                                <div className="text-slate-500 text-center py-10 bg-white rounded-lg border border-dashed border-slate-200">
                                    <p className="text-lg">No candidates in your queue right now.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {tickets.map(ticket => {
                                        const c = candidates[ticket.candidate_id]
                                        const isBusy = c?.status === "in_interview" && ticket.status !== "interviewing"

                                        return (
                                            <div key={ticket.id} className={`flex flex-col md:flex-row items-center justify-between p-5 border rounded-xl transition-all duration-200 ${isBusy ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-blue-100 shadow-sm hover:shadow-md'}`}>
                                                <div className="flex flex-col mb-4 md:mb-0 w-full md:w-auto">
                                                    <div className="flex items-center space-x-3 mb-1">
                                                        <h4 className={`text-lg font-bold ${isBusy ? 'text-slate-500' : 'text-slate-900'}`}>{ticket.candidate_name}</h4>
                                                        <Badge variant={ticket.status === 'called' ? 'called' : ticket.status === 'interviewing' ? 'interviewing' : 'waiting'}>
                                                            {ticket.status.toUpperCase()}
                                                        </Badge>
                                                        {isBusy && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">In another interview</Badge>}
                                                    </div>
                                                    <p className={`text-sm font-medium ${isBusy ? 'text-slate-400' : 'text-slate-500'}`}>Candidate Status: <span className="uppercase">{c?.status || "unknown"}</span></p>
                                                </div>

                                                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                                                    {ticket.status === 'pending' && (
                                                        <>
                                                            <Button size="lg" onClick={() => handleCall(ticket.id)} disabled={isBusy} className="flex-1 md:flex-none font-semibold">Call to Room</Button>
                                                            <Button size="lg" variant="outline" onClick={() => handleSkip(ticket.id)} className="flex-1 md:flex-none text-slate-500 border-slate-200 bg-white hover:bg-slate-50">No Show (Skip)</Button>
                                                        </>
                                                    )}
                                                    {ticket.status === 'called' && (
                                                        <>
                                                            <Button size="lg" onClick={() => handleStartInterview(ticket.id, ticket.candidate_id)} className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 font-semibold shadow-sm shadow-green-600/20">Start Interview</Button>
                                                            <Button size="lg" variant="outline" onClick={() => handleSkip(ticket.id)} className="flex-1 md:flex-none text-slate-500 border-slate-200 bg-white hover:bg-slate-50">No Show</Button>
                                                        </>
                                                    )}
                                                    {ticket.status === 'interviewing' && (
                                                        <Button size="lg" onClick={() => handleComplete(ticket.id, ticket.candidate_id)} className="w-full md:w-auto bg-purple-600 hover:bg-purple-700 font-semibold shadow-sm shadow-purple-600/20">Mark Complete</Button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
