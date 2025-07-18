// Admin component for managing crypto events from partners
import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, getDocs, doc, updateDoc, query, where, arrayUnion, arrayRemove } from "firebase/firestore";

interface Partner {
  id: string;
  name: string;
  logoUrl: string;
  description: string;
  website: string;
  type?: string;
  discount?: number;
  events?: Event[];
  createdAt: string;
}

interface Event {
  id: string;
  title: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  ticketLink: string;
  sponsorLink: string;
  linkedinLink: string;
  twitterLink: string;
  speakers: string[];
  discount: number;
  createdAt: string;
}

const AdminEventsManager: React.FC = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [eventPartners, setEventPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"create" | "list">("create");
  
  // Form state
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    location: "",
    startDate: "",
    endDate: "",
    ticketLink: "",
    sponsorLink: "",
    linkedinLink: "",
    twitterLink: "",
    speakers: [""],
    discount: 0,
    partnerId: ""
  });

  // Mobile detection effect
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIfMobile();
    window.addEventListener("resize", checkIfMobile);
    return () => window.removeEventListener("resize", checkIfMobile);
  }, []);
  
  useEffect(() => {
    fetchPartners();
  }, []);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const partnersCollection = collection(db, "partners");
      const partnerSnapshot = await getDocs(partnersCollection);
      const partnersList = partnerSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      } as Partner));
      
      setPartners(partnersList);
      
      // Filter partners with type "Event"
      const eventPartnersList = partnersList.filter(partner => partner.type === "Event");
      setEventPartners(eventPartnersList);
    } catch (error) {
      console.error("Error fetching partners:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title || !newEvent.partnerId || !newEvent.startDate || !newEvent.endDate) {
      alert("Event title, partner, start date, and end date are required");
      return;
    }

    try {
      const eventId = Date.now().toString();
      const eventData = {
        ...newEvent,
        id: eventId,
        speakers: newEvent.speakers.filter(speaker => speaker.trim() !== ""),
        createdAt: new Date().toISOString()
      };

      // Add event to the selected partner's events array
      const partnerRef = doc(db, "partners", newEvent.partnerId);
      await updateDoc(partnerRef, {
        events: arrayUnion(eventData)
      });

      // Reset form
      setNewEvent({
        title: "",
        description: "",
        location: "",
        startDate: "",
        endDate: "",
        ticketLink: "",
        sponsorLink: "",
        linkedinLink: "",
        twitterLink: "",
        speakers: [""],
        discount: 0,
        partnerId: ""
      });

      // Refresh partners list
      fetchPartners();
      
      // Switch to events list tab to show the created event
      setActiveTab("list");
    } catch (error) {
      console.error("Error adding event:", error);
      alert("Failed to add event. Please try again.");
    }
  };

  const handleDeleteEvent = async (partnerId: string, eventId: string) => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    
    try {
      const partner = partners.find(p => p.id === partnerId);
      if (!partner || !partner.events) return;

      const eventToDelete = partner.events.find(e => e.id === eventId);
      if (!eventToDelete) return;

      const partnerRef = doc(db, "partners", partnerId);
      await updateDoc(partnerRef, {
        events: arrayRemove(eventToDelete)
      });
      
      // Refresh partners list
      fetchPartners();
    } catch (error) {
      console.error("Error deleting event:", error);
      alert("Failed to delete event. Please try again.");
    }
  };

  const toggleEventExpansion = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const addSpeakerField = () => {
    setNewEvent(prev => ({
      ...prev,
      speakers: [...prev.speakers, ""]
    }));
  };

  const removeSpeakerField = (index: number) => {
    setNewEvent(prev => ({
      ...prev,
      speakers: prev.speakers.filter((_, i) => i !== index)
    }));
  };

  const updateSpeaker = (index: number, value: string) => {
    setNewEvent(prev => ({
      ...prev,
      speakers: prev.speakers.map((speaker, i) => i === index ? value : speaker)
    }));
  };

  // Get all events from all partners
  const allEvents = partners.flatMap(partner => 
    (partner.events || []).map(event => ({
      ...event,
      partnerName: partner.name,
      partnerLogo: partner.logoUrl,
      partnerId: partner.id
    }))
  );

  return (
    <div className={`${isMobile ? 'p-2' : 'p-4 md:p-6'}`}>
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-700 mb-6">
        <button
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "create" 
              ? "border-orange-500 text-orange-500" 
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
          onClick={() => setActiveTab("create")}
        >
          Create New Event
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ml-4 ${
            activeTab === "list" 
              ? "border-orange-500 text-orange-500" 
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
          onClick={() => setActiveTab("list")}
        >
          Events List
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "create" && (
        <div className="space-y-4">
          {/* Add Event Form */}
          <div className={`bg-black/30 ${isMobile ? 'p-3' : 'p-4 md:p-6'} rounded-xl border border-gray-700`}>
            <h3 className={`${isMobile ? 'text-sm' : 'text-base'} font-semibold text-orange-300 mb-3`}>Create New Event</h3>
            <form onSubmit={handleAddEvent} className="space-y-3">
              {/* Partner Selection */}
              <div>
                <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>Select Partner*</label>
                <select
                  className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                  value={newEvent.partnerId}
                  onChange={(e) => setNewEvent({...newEvent, partnerId: e.target.value})}
                  required
                >
                  <option value="">Choose a partner</option>
                  {eventPartners.map(partner => (
                    <option key={partner.id} value={partner.id}>
                      {partner.name}
                    </option>
                  ))}
                </select>
                {eventPartners.length === 0 && (
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-400 mt-1`}>
                    No partners with "Event" type found. Please add partners with type "Event" first.
                  </p>
                )}
              </div>

              {/* Event Title */}
              <div>
                <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>Event Title*</label>
                <input
                  type="text"
                  className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                  required
                />
              </div>

              {/* Event Description */}
              <div>
                <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>Description</label>
                <textarea
                  className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                  rows={isMobile ? 2 : 3}
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
                />
              </div>

              {/* Location */}
              <div>
                <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>Location (Where)</label>
                <input
                  type="text"
                  className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({...newEvent, location: e.target.value})}
                  placeholder="e.g., Online, Miami, New York"
                />
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>Start Date*</label>
                  <input
                    type="datetime-local"
                    className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                    value={newEvent.startDate}
                    onChange={(e) => setNewEvent({...newEvent, startDate: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>End Date*</label>
                  <input
                    type="datetime-local"
                    className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                    value={newEvent.endDate}
                    onChange={(e) => setNewEvent({...newEvent, endDate: e.target.value})}
                    required
                  />
                </div>
              </div>

              {/* Links */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>Ticket Purchase Link</label>
                  <input
                    type="url"
                    className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                    value={newEvent.ticketLink}
                    onChange={(e) => setNewEvent({...newEvent, ticketLink: e.target.value})}
                    placeholder="https://tickets.example.com"
                  />
                </div>
                <div>
                  <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>Sponsor Link</label>
                  <input
                    type="url"
                    className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                    value={newEvent.sponsorLink}
                    onChange={(e) => setNewEvent({...newEvent, sponsorLink: e.target.value})}
                    placeholder="https://sponsor.example.com"
                  />
                </div>
              </div>

              {/* Social Media Links */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>LinkedIn Link</label>
                  <input
                    type="url"
                    className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                    value={newEvent.linkedinLink}
                    onChange={(e) => setNewEvent({...newEvent, linkedinLink: e.target.value})}
                    placeholder="https://linkedin.com/events/..."
                  />
                </div>
                <div>
                  <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>Twitter Link</label>
                  <input
                    type="url"
                    className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                    value={newEvent.twitterLink}
                    onChange={(e) => setNewEvent({...newEvent, twitterLink: e.target.value})}
                    placeholder="https://twitter.com/..."
                  />
                </div>
              </div>

              {/* Speakers */}
              <div>
                <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>Speakers</label>
                {newEvent.speakers.map((speaker, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      className={`flex-1 ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                      value={speaker}
                      onChange={(e) => updateSpeaker(index, e.target.value)}
                      placeholder="Speaker name"
                    />
                    {newEvent.speakers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSpeakerField(index)}
                        className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg text-xs"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSpeakerField}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded-lg text-xs mt-2"
                >
                  Add Speaker
                </button>
              </div>

              {/* Discount */}
              <div>
                <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-300 mb-1`}>Discount %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className={`w-full ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} bg-black/40 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-400 focus:outline-none`}
                  value={newEvent.discount}
                  onChange={(e) => setNewEvent({...newEvent, discount: Number(e.target.value)})}
                  placeholder="0"
                />
              </div>

              <div>
                <button
                  type="submit"
                  className={`bg-orange-500 text-white ${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} rounded-lg hover:bg-orange-600 disabled:opacity-60 font-semibold shadow`}
                  disabled={loading}
                >
                  Create Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === "list" && (
        <div className="space-y-4">
          {/* Events List */}
          <div className={`bg-black/30 ${isMobile ? 'p-3' : 'p-4 md:p-6'} rounded-xl border border-gray-700`}>
            <h3 className={`${isMobile ? 'text-sm' : 'text-base'} font-semibold text-orange-300 mb-3`}>All Events</h3>
            
            {loading ? (
              <div className="text-center p-4">
                <span className={`text-gray-400 ${isMobile ? 'text-xs' : ''}`}>Loading events...</span>
              </div>
            ) : allEvents.length === 0 ? (
              <div className="text-center p-4 bg-black/20 rounded-lg">
                <span className={`text-gray-400 ${isMobile ? 'text-xs' : ''}`}>No events created yet.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {allEvents.map((event) => {
                  const isExpanded = expandedEvents.has(event.id);
                  return (
                    <div key={event.id} className={`bg-black/40 rounded-lg ${isMobile ? 'p-2' : 'p-3'} border border-gray-700 transition-all duration-200 hover:border-orange-500/50`}>
                      <div 
                        className={`flex items-center justify-between cursor-pointer`}
                        onClick={() => toggleEventExpansion(event.id)}
                      >
                        <div className={`flex items-center ${isMobile ? 'space-x-2' : 'space-x-3'}`}>
                          <div className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} bg-black/50 rounded-md border border-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0`}>
                            <img 
                              src={event.partnerLogo} 
                              alt={event.partnerName} 
                              className="max-w-full max-h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/favicon2x.png';
                              }}
                            />
                          </div>
                          <div>
                            <h4 className={`font-semibold text-orange-200 ${isMobile ? 'text-xs' : 'text-sm'}`}>{event.title}</h4>
                            <p className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>{event.partnerName}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <span className={`${isMobile ? 'text-xs' : 'text-sm'} bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md border border-blue-500/30`}>
                            {new Date(event.startDate).toLocaleDateString()}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEvent(event.partnerId, event.id);
                            }}
                            className={`${isMobile ? 'text-xs px-1 py-1' : 'text-sm px-2 py-1'} text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded`}
                            title="Delete event"
                          >
                            Delete
                          </button>
                          <span className={`text-gray-400 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                            ↓
                          </span>
                        </div>
                      </div>
                      
                      {/* Expanded details */}
                      {isExpanded && (
                        <div className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-400 mt-3 pt-3 border-t border-gray-600`}>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="mb-2"><strong>Description:</strong> {event.description || "No description"}</p>
                              <p className="mb-2"><strong>Location:</strong> {event.location || "Not specified"}</p>
                              <p className="mb-2"><strong>Start:</strong> {new Date(event.startDate).toLocaleString()}</p>
                              <p className="mb-2"><strong>End:</strong> {new Date(event.endDate).toLocaleString()}</p>
                              <p className="mb-2"><strong>Discount:</strong> {event.discount}%</p>
                            </div>
                            <div>
                              <p className="mb-2"><strong>Speakers:</strong> {event.speakers.length > 0 ? event.speakers.join(", ") : "No speakers listed"}</p>
                              <div className="space-y-1">
                                {event.ticketLink && (
                                  <p><strong>Tickets:</strong> <a href={event.ticketLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Buy Tickets</a></p>
                                )}
                                {event.sponsorLink && (
                                  <p><strong>Sponsor:</strong> <a href={event.sponsorLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Sponsor Link</a></p>
                                )}
                                {event.linkedinLink && (
                                  <p><strong>LinkedIn:</strong> <a href={event.linkedinLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">LinkedIn Event</a></p>
                                )}
                                {event.twitterLink && (
                                  <p><strong>Twitter:</strong> <a href={event.twitterLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Twitter Link</a></p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEventsManager;
