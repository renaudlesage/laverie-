import {
  ArrowLeftRight, Ban, Biohazard, Building2, Camera, ChartColumn, ClipboardList, Contact, FileUp, House, ImagePlus,
  Layers, LifeBuoy, LogOut, MapPin, Moon, Nfc, Package, PackageCheck, PackageOpen, Pause, Play, Plus, QrCode, RefreshCw,
  ScanBarcode, ScanLine, Search, SearchCheck, Settings, ShieldCheck, Shirt, ShoppingBag, Sun, Tag, Truck, Undo2,
  UserCheck, UserMinus, UserPlus, Users, WashingMachine, Wifi, WifiOff, Archive, ListChecks, Mail, KeyRound, Droplets,
} from 'lucide-react';

// Icônes de l'application, par sens (et non par dessin) : un même geste a toujours la même icône.
// Monochromes (couleur du texte), jamais décoratives : la couleur reste réservée aux états.
const ICONES = {
  accueil: House,
  scanner: ScanLine,
  laverie: WashingMachine,
  reglages: Settings,
  plateforme: Building2,
  changer: ArrowLeftRight,
  sombre: Moon,
  clair: Sun,
  sortie: LogOut,
  enLigne: Wifi,
  horsLigne: WifiOff,
  actualiser: RefreshCw,
  rechercher: Search,
  rapports: ChartColumn,
  inventaire: ClipboardList,
  enroler: Tag,
  etiquettes: QrCode,
  importer: FileUp,
  sites: MapPin,
  traitements: Droplets,
  articles: Shirt,
  porteurs: Contact,
  lecteurs: ScanBarcode,
  sacs: ShoppingBag,
  membres: Users,
  organisation: Building2,
  collecte: Package,
  reception: PackageOpen,
  lots: Layers,
  controle: ShieldCheck,
  livraison: Truck,
  unitaire: ScanLine,
  rafale: ListChecks,
  camera: Camera,
  nfc: Nfc,
  attribution: UserCheck,
  restitution: Undo2,
  contamination: Biohazard,
  retrouve: SearchCheck,
  perte: Ban,
  reforme: Archive,
  pret: PackageCheck,
  support: LifeBuoy,
  ajouterPersonne: UserPlus,
  retirerPersonne: UserMinus,
  suspendre: Pause,
  reactiver: Play,
  logo: ImagePlus,
  ajouter: Plus,
  lien: Mail,
  motDePasse: KeyRound,
};

export default function Icone({ nom, taille = 20, className = '' }) {
  const Composant = ICONES[nom];
  if (!Composant) return null;
  return <Composant className={`icone ${className}`} size={taille} strokeWidth={2} aria-hidden="true" focusable="false" />;
}
