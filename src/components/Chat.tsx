import ChatScreen from "./ChatScreen";

interface ChatProps {
  patientId: string;
  doctorId: string;
  currentUserId: string;
  patientName?: string;
}

const Chat = ({ patientId, doctorId, currentUserId, patientName = "Patient" }: ChatProps) => {
  return (
    <ChatScreen
      patientId={patientId}
      doctorId={doctorId}
      currentUserId={currentUserId}
      patientName={patientName}
    />
  );
};

export default Chat;