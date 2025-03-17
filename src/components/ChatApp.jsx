import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import "../styles/ChatApp.css"; // Import the CSS file

// -------------------
// Supabase Setup
// -------------------
const SUPABASE_URL = "https://ueswvkitrkkkmemrxpir.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlc3d2a2l0cmtra21lbXJ4cGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA2NzI3NDEsImV4cCI6MjA1NjI0ODc0MX0.21_qSMwhFGgXx4k6VnI5BUkSsD1eFKzQmAAzR9pHrX4"
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -------------------
// Custom Role Map
// -------------------
const emailToRole = {
    "ceo@example.com" : "CEO",
    "volunteer@example.com": "Volunteer",
    "boardmember@example.com": "Board Member",
    "reptile-caregiver@example.com": "Caregiver",
    "hr@example.com": "HR",
    "dog-caregiver@example.com": "Caregiver",
    "cat-caregiver@example.com": "Caregiver",
    "caregivers@example.com" : "Caregiver",
    "headcare@example.com": "Head Caregiver",
    "bird-caregiver@nsae.com" : "Caregiver",
    "wildlife-caregiver@nsae.com": "Caregiver",
    "mamal-caregiver@nase.com": "Caregiver",
    "other-caregiver@nase.com": "Caregiver"
};
function getRoleByEmail(email) {
  return emailToRole[email] || "Volunteer";
}

export default function ChatApp() {
  // -------------------
  // State Variables
  // -------------------
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // chatMode can be: "group" / "dm" / "multi_group"
  const [chatMode, setChatMode] = useState("group");

  // For direct messages
  const [selectedUser, setSelectedUser] = useState("");

  // For multi-user group
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [multiGroupUsers, setMultiGroupUsers] = useState([]);
  const [multiGroupRecipient, setMultiGroupRecipient] = useState("");

  // We'll store all private group chats the user is a member of
  const [privateGroups, setPrivateGroups] = useState([]);

  // *Toast-style* notification for new incoming messages
  const [newMessageNotification, setNewMessageNotification] = useState("");

  // Unread counts
  const [orgUnreadCount, setOrgUnreadCount] = useState(0);
  const [dmUnreadChats, setDmUnreadChats] = useState([]);

  // Combined list of all possible user emails
  const [allPossibleUsers, setAllPossibleUsers] = useState([]);
  const [notification, setNotification] = useState(null);

  // Predefined caregivers
  const predefinedEmails = [
    "ceo@example.com",
    "volunteer@example.com",
    "boardmember@example.com",
    "reptile-caregiver@example.com",
    "hr@example.com",
    "dog-caregiver@example.com",
    "cat-caregiver@example.com",
    "caregivers@example.com",
    "headcare@example.com",
    "bird-caregiver@nsae.com",
    "wildlife-caregiver@nsae.com",
    "mamal-caregiver@nase.com",
    "other-caregiver@nase.com"
  ];

  // -------------------
  // 1) On Mount
  // -------------------
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setUserEmail(session.user.email);
      }
      await fetchAllUsers();
    })();
  }, []);

  // -------------------
  // 2) Fetch all users
  // -------------------
  async function fetchAllUsers() {
    try {
      const { data, error } = await supabase.from("users").select("email");
      if (error) {
        console.error("Error fetching users table:", error);
        return;
      }
      if (!data) return;

      const userTableEmails = data.map((u) => u.email);
      const combined = new Set([...userTableEmails, ...predefinedEmails]);
      // Exclude self
      const finalList = [...combined].filter((email) => email !== userEmail);
      setAllPossibleUsers(finalList);
    } catch (err) {
      console.error("Unexpected error fetching all users:", err);
    }
  }

  // -------------------
  // 3) Fetch messages
  // -------------------
  async function fetchMessages() {
    if (!userEmail) return;

    let query = supabase.from("messages").select("*");

    if (chatMode === "group") {
      query = query.eq("type", "group").eq("recipient", "group");
    } else if (chatMode === "dm") {
      if (!selectedUser) {
        setMessages([]);
        return;
      }
      query = query
        .eq("type", "dm")
        .in("sender", [userEmail, selectedUser])
        .in("recipient", [userEmail, selectedUser]);
    } else if (chatMode === "multi_group") {
      if (!multiGroupRecipient) {
        setMessages([]);
        return;
      }
      query = query
        .eq("type", "multi_group")
        .eq("recipient", multiGroupRecipient);
    }

    // Always sort by creation time
    query = query.order("created_at", { ascending: true });

    const { data, error } = await query;
    if (error) {
      console.error("❌ Error fetching messages:", error);
      return;
    }
    const fetched = data || [];
    setMessages(fetched);

    // Mark them as read
    if (fetched.length > 0) {
      await markMessagesAsRead(fetched);
    }
  }

  // -------------------
  // 4) Mark messages as read
  // -------------------
  async function markMessagesAsRead(msgs) {
    if (!userEmail) return;

    const inserts = msgs.map((m) => ({
      message_id: m.id,
      user_email: userEmail,
    }));

    const { error } = await supabase
      .from("message_reads")
      .insert(inserts, { upsert: true });
    if (error) {
      console.error("Error marking messages as read:", error);
      return;
    }

    // Refresh unread counts
    fetchOrgUnreadCount();
    await fetchDMUnreadChats();
  }

  // -------------------
  // 5) Send a message
  // -------------------
  async function sendMessage() {
    if (!newMessage.trim()) return;

    const role = getRoleByEmail(userEmail);
    const messageData = {
      text: newMessage,
      sender: userEmail,
      role
    };

    if (chatMode === "group") {
      messageData.type = "group";
      messageData.recipient = "group";
    } else if (chatMode === "dm") {
      messageData.type = "dm";
      messageData.recipient = selectedUser;
    } else if (chatMode === "multi_group") {
      messageData.type = "multi_group";
      messageData.recipient = multiGroupRecipient;
    }

    setNewMessage("");
    const { error } = await supabase.from("messages").insert([messageData]);
    if (error) {
      console.error("Error sending message:", error);
      return;
    }
    // Immediately refresh so user sees their own message
    fetchMessages();
  }

  // -------------------
  // 6) Real-time subscription
  // -------------------
  useEffect(() => {
    if (!userEmail) return;

    const subscription = supabase
      .channel("messages-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new;
          if (newMsg && newMsg.sender !== userEmail) {
            let note = "";
            if (newMsg.type === "group") {
              note = `New message in Organization Chat from ${newMsg.sender}`;
            } else if (newMsg.type === "dm") {
              note = `New direct message from ${newMsg.sender}`;
            } else if (newMsg.type === "multi_group") {
              note = `New message in a private group from ${newMsg.sender}`;
            }
            setNotification(`New Message from: ${newMsg.sender} (${newMsg.type})`);
          }

          // If we're currently viewing the relevant chat, refresh
          if (newMsg.type === "group" && chatMode === "group") {
            fetchMessages();
          } else if (newMsg.type === "dm" && chatMode === "dm") {
            const involved = [newMsg.sender, newMsg.recipient];
            if (involved.includes(userEmail) && involved.includes(selectedUser)) {
              fetchMessages();
            }
          } else if (
            newMsg.type === "multi_group" &&
            chatMode === "multi_group"
          ) {
            if (newMsg.recipient === multiGroupRecipient) {
              fetchMessages();
            }
          }

          // Recalc unread
          fetchOrgUnreadCount();
          fetchDMUnreadChats();
          fetchPrivateGroups();
        }
      )
      .subscribe();

    // On mount, fetch everything
    fetchOrgUnreadCount();
    fetchDMUnreadChats();
    fetchPrivateGroups();

    return () => {
      supabase.removeChannel(subscription);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, chatMode, selectedUser, multiGroupRecipient]);

  // -------------------
  // 7) Whenever chatMode/selectedUser changes, etc.
  // -------------------
  useEffect(() => {
    if (userEmail) {
      fetchMessages();
      fetchOrgUnreadCount();
      fetchDMUnreadChats();
      fetchPrivateGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMode, selectedUser, multiGroupRecipient, userEmail]);

  // -------------------
  // 8) Organization unread count
  // -------------------
  async function fetchOrgUnreadCount() {
    if (!userEmail) return;
    const { data, error } = await supabase.rpc("org_unread_count", {
      p_user: userEmail,
    });
    if (error) {
      console.error("Error fetching org unread count:", error);
      return;
    }
    setOrgUnreadCount(data || 0);
  }

  // -------------------
  // 9) DM unread chats
  // -------------------
  async function fetchDMUnreadChats() {
    if (!userEmail) return;
    const { data, error } = await supabase.rpc("dm_unread_chats", {
      p_user: userEmail,
    });
    if (error) {
      console.error("Error fetching DM unread chats:", error);
      return;
    }
    const arr = data || [];
    setDmUnreadChats(arr.filter((x) => x !== null));
  }

  // -------------------
  // 10) Create new multi-user group
  // -------------------
  async function createNewGroupChat() {
    if (multiGroupUsers.length === 0) return;

    const participants = new Set(multiGroupUsers);
    participants.add(userEmail);
    const sortedList = [...participants].sort();
    const groupString = sortedList.join(";");

    const role = getRoleByEmail(userEmail);
    const messageData = {
      text: "Group chat created!",
      sender: userEmail,
      role,
      type: "multi_group",
      recipient: groupString,
    };

    const { error } = await supabase.from("messages").insert([messageData]);
    if (error) {
      console.error("Error creating group chat:", error);
      return;
    }
    setShowCreateGroup(false);
    setMultiGroupUsers([]);
    setChatMode("multi_group");
    setMultiGroupRecipient(groupString);
    setNewMessageNotification("");
  }

  // -------------------
  // 11) Fetch private groups
  // -------------------
  async function fetchPrivateGroups() {
    if (!userEmail) return;
    const { data, error } = await supabase
      .from("messages")
      .select("recipient")
      .eq("type", "multi_group");
    if (error) {
      console.error("Error fetching private groups:", error);
      return;
    }
    if (!data) return;

    const groupSet = new Set();
    data.forEach((row) => {
      if (row.recipient.includes(userEmail)) {
        groupSet.add(row.recipient);
      }
    });
    setPrivateGroups([...groupSet]);
  }

  // ** New function: Refresh everything manually **
  function manualRefresh() {
    fetchMessages();
    fetchOrgUnreadCount();
    fetchDMUnreadChats();
    fetchPrivateGroups();
  }

  // Helper: toggle checkboxes for multi-group selection
  function toggleMultiGroupUser(u) {
    setMultiGroupUsers((prev) =>
      prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]
    );
  }

  // -------------------
  // 12) Filter messages
  // -------------------
  let filteredMessages = [];
  if (chatMode === "group") {
    filteredMessages = messages.filter(
      (m) => m.type === "group" && m.recipient === "group"
    );
  } else if (chatMode === "dm") {
    filteredMessages = messages.filter(
      (m) =>
        m.type === "dm" &&
        ((m.sender === userEmail && m.recipient === selectedUser) ||
          (m.sender === selectedUser && m.recipient === userEmail))
    );
  } else if (chatMode === "multi_group") {
    filteredMessages = messages.filter(
      (m) => m.type === "multi_group" && m.recipient === multiGroupRecipient
    );
  }

  // -------------------
  // 13) Render UI
  // -------------------
  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "20px auto",
        textAlign: "center",
        border: "1px solid #ddd",
        padding: "15px",
        borderRadius: "8px",
        background: "#f9f9f9",
        position: "relative",
      }}
    >
      {/* Toast-Style Banner for new messages */}
      {newMessageNotification && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            backgroundColor: "#f1c40f",
            padding: "10px 15px",
            borderRadius: "5px",
            boxShadow: "0 0 5px rgba(0,0,0,0.3)",
            cursor: "pointer",
            fontWeight: "bold",
            zIndex: 9999,
          }}
          onClick={() => setNewMessageNotification("")}
        >
          {newMessageNotification}
        </div>
      )}

      <h3>
        {chatMode === "group"
          ? "Organization Chat"
          : chatMode === "dm"
          ? selectedUser
            ? `Chat with ${selectedUser}`
            : "Direct Messages"
          : "Private Group Chat"}
      </h3>

      {/* Top Nav Buttons */}
      <button
        onClick={() => {
          setChatMode("group");
          setSelectedUser("");
          setMultiGroupRecipient("");
          setShowCreateGroup(false);
          setNewMessageNotification("");
        }}
        style={{
          margin: "5px",
          padding: "5px 10px",
          background: chatMode === "group" ? "#007bff" : "#ccc",
          color: "white",
          border: "none",
          borderRadius: "5px",
        }}
      >
        Organization Chat
      </button>

      <button
        onClick={() => {
          setChatMode("dm");
          setMultiGroupRecipient("");
          setShowCreateGroup(false);
          setNewMessageNotification("");
        }}
        style={{
          margin: "5px",
          padding: "5px 10px",
          background: chatMode === "dm" ? "#007bff" : "#ccc",
          color: "white",
          border: "none",
          borderRadius: "5px",
        }}
      >
        Direct Messages
      </button>

      <button
        onClick={() => {
          setChatMode("multi_group");
          setSelectedUser("");
          setNewMessageNotification("");
          setShowCreateGroup(false);
        }}
        style={{
          margin: "5px",
          padding: "5px 10px",
          background: chatMode === "multi_group" ? "#28a745" : "#999",
          color: "white",
          border: "none",
          borderRadius: "5px",
        }}
      >
        Private Group Chat
      </button>

      {/* NEW: "Refresh Chat" button */}
      <button
        onClick={manualRefresh}
        style={{
          marginLeft: "10px",
          padding: "5px 10px",
          background: "#ffc107",
          color: "#333",
          border: "none",
          borderRadius: "5px",
          fontWeight: "bold"
        }}
      >
        Refresh Chat
      </button>

      {/* DM Mode */}
      {chatMode === "dm" && (
        <div style={{ marginTop: "10px" }}>
          <label>Select user:</label>
          <select
            value={selectedUser}
            onChange={(e) => {
              setSelectedUser(e.target.value);
              setNewMessageNotification("");
            }}
            style={{ padding: "5px", marginLeft: "10px" }}
          >
            <option value="">Select a user</option>
            {allPossibleUsers.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          {dmUnreadChats.length > 0 && (
            <div style={{ margin: "10px", textAlign: "left" }}>
              <h4>Recent DM Chats: </h4>
              {dmUnreadChats.map((partner) => (
                <div key={partner} style={{ marginBottom: "5px" }}>
                  <button
                    onClick={() => {
                      setSelectedUser(partner);
                      setNewMessageNotification("");
                    }}
                    style={{
                      padding: "5px 10px",
                      background: selectedUser === partner ? "#007bff" : "#ccc",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                    }}
                  >
                    {partner}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Multi-group creation + list */}
      {chatMode === "multi_group" && (
        <div style={{ marginTop: "10px", textAlign: "left" }}>
          {!showCreateGroup && (
            <button
              onClick={() => setShowCreateGroup(true)}
              style={{
                padding: "5px 10px",
                background: "#007bff",
                color: "white",
                border: "none",
                borderRadius: "5px",
                marginBottom: "10px",
              }}
            >
              Create Group
            </button>
          )}

          {showCreateGroup && (
            <div style={{ marginBottom: "10px" }}>
              <p>Select multiple users for your group:</p>
              {allPossibleUsers.map((u) => (
                <div key={u} style={{ marginBottom: "5px" }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={multiGroupUsers.includes(u)}
                      onChange={() => toggleMultiGroupUser(u)}
                      style={{ marginRight: "6px" }}
                    />
                    {u}
                  </label>
                </div>
              ))}
              <div style={{ marginTop: "10px" }}>
                <button
                  onClick={createNewGroupChat}
                  style={{
                    padding: "5px 10px",
                    background: "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    marginRight: "5px",
                  }}
                >
                  Create Group
                </button>
                <button
                  onClick={() => {
                    setShowCreateGroup(false);
                    setMultiGroupUsers([]);
                  }}
                  style={{
                    padding: "5px 10px",
                    background: "#999",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <h4>Your Private Groups</h4>
          {privateGroups.length === 0 ? (
            <p>You are not in any private group chats yet.</p>
          ) : (
            privateGroups.map((grp) => {
              const members = grp.split(";");
              const displayLabel =
                members.length > 2
                  ? members.slice(0, 2).join(", ") + "..."
                  : members.join(", ");

              return (
                <div key={grp} style={{ marginBottom: "5px" }}>
                  <button
                    onClick={() => {
                      setMultiGroupRecipient(grp);
                      setShowCreateGroup(false);
                      setNewMessageNotification("");
                    }}
                    style={{
                      padding: "5px 10px",
                      background:
                        multiGroupRecipient === grp ? "#007bff" : "#ccc",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                      marginRight: "6px",
                    }}
                  >
                    {displayLabel}
                  </button>
                  <button
                    onClick={() => {
                      alert("Group Members:\n" + members.join("\n"));
                    }}
                    style={{
                      padding: "5px 10px",
                      background: "#6c757d",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                    }}
                  >
                    Show Members
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Main message display */}
      <div
        style={{
          border: "1px solid #ccc",
          height: "300px",
          overflowY: "auto",
          padding: "10px",
          background: "white",
          marginTop: "10px",
          textAlign: "left",
        }}
      >
        {chatMode === "group" && filteredMessages.length === 0 ? (
          <p>No messages yet in Organization Chat.</p>
        ) : chatMode === "dm" && !selectedUser ? (
          <p>Please select a user to view direct messages.</p>
        ) : chatMode === "multi_group" && !multiGroupRecipient ? (
          <p>Select or create a private group chat.</p>
        ) : filteredMessages.length > 0 ? (
          filteredMessages.map((msg) => (
            <div
              key={msg.id}
              style={{
                textAlign: msg.sender === userEmail ? "right" : "left",
                marginBottom: "10px",
              }}
            >
              <strong>
                {msg.sender} ({msg.role || "Unknown"}):
              </strong>
              <p>{msg.text}</p>
            </div>
          ))
        ) : (
          <p>No messages yet.</p>
        )}
      </div>

      {/* Message input box */}
      <div style={{ marginTop: "10px" }}>
        <input
          type="text"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          style={{ width: "70%", padding: "5px" }}
        />
        <button
          onClick={sendMessage}
          style={{
            padding: "5px 10px",
            marginLeft: "5px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "5px",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
