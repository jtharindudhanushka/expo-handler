"use client"
import { useState, useEffect } from "react"
import { collection, addDoc, onSnapshot, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function RegistrationView() {
  const [name, setName] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [companies, setCompanies] = useState<any[]>([])
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // We only need to set this up if Firebase is configured. 
    // If not, it will throw, but that's expected until user adds .env.local
    try {
      const unsub = onSnapshot(collection(db, "companies"), (snapshot) => {
        if (snapshot.empty) {
          setCompanies([])
        } else {
          setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
        }
        setLoading(false)
      }, (err) => {
        console.error("Firestore error:", err)
        setError("Firestore Error: Please check your Firebase Security Rules (must be in Test Mode) or Vercel Environment Variables.")
        setLoading(false)
      })
      return () => unsub()
    } catch (e: any) {
      console.warn("Firebase not fully configured yet.")
      setError(e.message || "Firebase not configured.")
      setLoading(false)
    }
  }, [])

  const seedCompanies = async () => {
    setLoading(true)
    const preset = [
      { name: "Google", room_number: "Room A1" },
      { name: "Microsoft", room_number: "Room B2" },
      { name: "Amazon", room_number: "Room C3" },
    ]
    for (const c of preset) {
      await addDoc(collection(db, "companies"), c)
    }
    setLoading(false)
  }

  const toggleCompany = (id: string) => {
    setSelectedCompanies(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !identifier || selectedCompanies.length === 0) return
    setSubmitting(true)

    try {
      // 1. Create candidate
      const candRef = await addDoc(collection(db, "candidates"), {
        name,
        identifier,
        status: "waiting", // 'waiting', 'in_interview', 'finished'
        registered_companies: selectedCompanies
      })

      // 2. Create queue tickets for each selected company
      for (const compId of selectedCompanies) {
        await addDoc(collection(db, "queue_tickets"), {
          candidate_id: candRef.id,
          candidate_name: name,
          company_id: compId,
          status: "pending", // 'pending', 'called', 'interviewing', 'completed', 'skipped'
          timestamp: serverTimestamp()
        })
      }

      alert(`Successfully registered ${name}!`)
      setName("")
      setIdentifier("")
      setSelectedCompanies([])
    } catch (error: any) {
      console.error(error)
      alert("Error saving: " + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (error) return <div className="p-8 text-center text-red-500 font-medium max-w-lg mx-auto mt-20">{error}</div>
  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Loading Database Connection...</div>
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex items-center justify-center">
      <Card className="w-full max-w-lg shadow-xl shadow-slate-200/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl text-center font-bold text-slate-900">Queue Registration</CardTitle>
          <p className="text-center text-slate-500 text-sm">Add walk-ins to the intelligent room queue.</p>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <div className="text-center py-6">
              <p className="mb-4 text-slate-600">No companies found in database.</p>
              <Button onClick={seedCompanies} variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">
                Seed Sample Companies
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Full Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Jane Doe" className="bg-slate-50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Phone or Student ID</label>
                <Input value={identifier} onChange={e => setIdentifier(e.target.value)} required placeholder="e.g. 123-456-7890" className="bg-slate-50" />
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-sm font-semibold text-slate-700">Select Companies to Interview With</label>
                <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white max-h-48 overflow-y-auto">
                  {companies.map(comp => (
                    <label key={comp.id} className={`flex items-center space-x-3 p-2 rounded-md cursor-pointer transition-colors ${selectedCompanies.includes(comp.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={selectedCompanies.includes(comp.id)}
                        onChange={() => toggleCompany(comp.id)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <span className="text-slate-800 font-medium">{comp.name} <span className="text-slate-500 text-sm font-normal ml-1">({comp.room_number})</span></span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <Button type="submit" size="lg" className="w-full text-md shadow-md" disabled={submitting || selectedCompanies.length === 0}>
                  {submitting ? "Registering..." : `Register for ${selectedCompanies.length} selected`}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
