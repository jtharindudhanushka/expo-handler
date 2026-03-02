"use client"
import { useState, useEffect } from "react"
import { collection, query, where, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function PublicBoard() {
    const [calledTickets, setCalledTickets] = useState<any[]>([])
    const [companies, setCompanies] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        try {
            const unsub = onSnapshot(collection(db, "companies"), (snapshot) => {
                const cMap: Record<string, any> = {}
                snapshot.docs.forEach(d => {
                    cMap[d.id] = { id: d.id, ...d.data() }
                })
                setCompanies(cMap)
            })
            return () => unsub()
        } catch { }
    }, [])

    useEffect(() => {
        try {
            const q = query(
                collection(db, "queue_tickets"),
                where("status", "==", "called")
            )

            const unsub = onSnapshot(q, (snapshot) => {
                const t = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
                t.sort((a: any, b: any) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0)) // Newest first
                setCalledTickets(t)
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

    if (error) return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <div className="text-2xl text-red-500 font-semibold tracking-wide text-center px-4 max-w-2xl">{error}</div>
        </div>
    )

    if (loading) return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <div className="text-3xl text-slate-400 animate-pulse font-semibold tracking-wide">Connecting to Queue...</div>
        </div>
    )

    return (
        <div className="min-h-screen bg-slate-950 p-6 md:p-12 flex flex-col font-sans">
            <header className="mb-12 text-center">
                <h1 className="text-5xl md:text-7xl font-black text-white tracking-tight drop-shadow-lg">NOW CALLING</h1>
                <p className="text-xl md:text-2xl text-slate-400 mt-4 font-medium">Please proceed to your designated room</p>
            </header>

            <main className="flex-1 max-w-[1400px] mx-auto w-full">
                {calledTickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/50">
                        <p className="text-3xl text-slate-600 font-semibold tracking-wide">Waiting for next candidate...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                        {calledTickets.map(ticket => {
                            const comp = companies[ticket.company_id]
                            return (
                                <Card key={ticket.id} className="bg-slate-900 border-none shadow-2xl overflow-hidden ring-1 ring-white/10 hover:ring-blue-500/50 transition-all duration-300 transform hover:-translate-y-1">
                                    <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
                                        <span className="text-blue-100 font-bold uppercase tracking-widest text-sm">Proceed To</span>
                                        <Badge className="bg-white text-blue-900 hover:bg-white border-0 text-lg md:text-xl font-black px-3 py-1 shadow-sm">
                                            {comp?.room_number || "Room ??"}
                                        </Badge>
                                    </div>
                                    <CardContent className="p-8">
                                        <h2 className="text-4xl md:text-5xl font-black text-white mb-3 truncate tracking-tight">
                                            {ticket.candidate_name}
                                        </h2>
                                        <p className="text-xl md:text-2xl text-slate-300 font-semibold flex items-center gap-3">
                                            <span className="w-3 h-3 rounded-full bg-green-500 inline-block animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.7)]"></span>
                                            {comp?.name || "Company"}
                                        </p>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                )}
            </main>
        </div>
    )
}
