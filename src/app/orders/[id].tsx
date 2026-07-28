import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Modal, Clipboard, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGlobalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { sqlite } from '../../shared/database/db';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { apiClient } from '../../shared/services/api/client';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { 
  ArrowLeft, Phone, Mail, MessageSquare, MapPin, Copy, 
  Printer, Share2, AlertCircle, ChevronDown, ShoppingBag, CreditCard, User, StickyNote, Trash2, Info, Edit2
} from 'lucide-react-native';
import { getCurrencySymbol, useSettingsStore } from '../../shared/store/settingsStore';
import BillingEditModal from './components/BillingEditModal';
import LineItemsEditModal from './components/LineItemsEditModal';
import DiscountEditModal from './components/DiscountEditModal';

export default function OrderDetailsScreen() {
  const router = useRouter();
  const { id } = useGlobalSearchParams();
  const orderId = Number(id);
  const orderStatuses = useSettingsStore(s => s.orderStatuses);

  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  // We use state for local optimistic updates without re-running the memo
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);

  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isCustomerNote, setIsCustomerNote] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [liveNotes, setLiveNotes] = useState<any[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);

  const [billingEditVisible, setBillingEditVisible] = useState(false);
  const [itemsEditVisible, setItemsEditVisible] = useState(false);
  const [discountEditVisible, setDiscountEditVisible] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // 1. Instant Data Fetching (0ms load time)
  const orderData = useMemo(() => {
    if (!id || isNaN(orderId)) return null;
    try {
      const res = sqlite.getAllSync<any>(
        `SELECT id, number, status, currency, date_created as dateCreated, total, billing, shipping, line_items as lineItems, discount_total as discountTotal, shipping_total as shippingTotal, payment_method_title as paymentMethodTitle, notes 
         FROM orders 
         WHERE id = ? LIMIT 1`,
         orderId
      );

      if (res && res.length > 0) {
        const row = res[0];
        let billingObj: any = {};
        let shippingObj: any = {};
        let itemsList: any[] = [];
        let notesList: any[] = [];
        try { billingObj = row.billing ? JSON.parse(row.billing) : {}; } catch {}
        try { shippingObj = row.shipping ? JSON.parse(row.shipping) : {}; } catch {}
        try { notesList = row.notes ? JSON.parse(row.notes) : []; } catch {}
        try { 
          const parsedItems = row.lineItems ? JSON.parse(row.lineItems) : []; 
          itemsList = parsedItems.map((item: any) => {
            if (!item.image?.src && item.product_id) {
              try {
                const productRow = sqlite.getFirstSync<any>(`SELECT images FROM products WHERE id = ? LIMIT 1`, item.product_id);
                if (productRow && productRow.images) {
                  const productImages = JSON.parse(productRow.images);
                  if (productImages && productImages.length > 0 && productImages[0].src) {
                    item.image = { src: productImages[0].src };
                  }
                }
              } catch (e) {}
            }
            return item;
          });
        } catch {}

        return {
          id: row.id,
          number: row.number,
          status: row.status,
          currency: row.currency || 'USD',
          dateCreated: row.dateCreated,
          total: row.total,
          billing: billingObj,
          shipping: shippingObj,
          lineItems: itemsList,
          notes: notesList,
          discountTotal: row.discountTotal || '0.00',
          shippingTotal: row.shippingTotal || '0.00',
          paymentMethodTitle: row.paymentMethodTitle || 'Standard Payment',
        };
      }
    } catch (err) {
      console.error('Failed to load order synchronously:', err);
    }
    return null;
  }, [id, orderId, refreshKey]);

  React.useEffect(() => {
    if (orderData?.notes && liveNotes.length === 0) {
      setLiveNotes(orderData.notes);
    }
  }, [orderData?.notes]);

  React.useEffect(() => {
    if (notesModalVisible) {
      fetchNotes();
    }
  }, [notesModalVisible]);

  React.useEffect(() => {
    if (historyModalVisible && orderData?.billing?.email) {
      try {
        const ordersRes = sqlite.getAllSync<any>(
          `SELECT id, number, status, currency, total, date_created as dateCreated 
           FROM orders 
           WHERE json_extract(billing, '$.email') = ?
           ORDER BY id DESC`,
          orderData.billing.email
        );
        setCustomerOrders(ordersRes);
      } catch (e) {
        console.error('Failed to fetch order history', e);
      }
    }
  }, [historyModalVisible, orderData?.billing?.email]);

  // Real-time polling for WooCommerce updates
  React.useEffect(() => {
    let isMounted = true;
    const pollInterval = setInterval(async () => {
      try {
        const result: any = await apiClient.get(`orders/${orderId}`);
        if (!isMounted) return;

        sqlite.runSync(
           `UPDATE orders SET status = ?, total = ?, billing = ?, shipping = ?, line_items = ?, discount_total = ?, shipping_total = ?, last_updated = ? WHERE id = ?`,
           result.status, 
           result.total, 
           JSON.stringify(result.billing), 
           JSON.stringify(result.shipping), 
           JSON.stringify(result.line_items), 
           result.discount_total,
           result.shipping_total,
           Date.now(), 
           orderId
        );
        
        // Trigger a seamless re-render to reflect any external WooCommerce changes
        setRefreshKey(Date.now());
      } catch (err) {
        // Silently fail if offline or network error
      }
    }, 5000); // 5 seconds polling for "instant" feel

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [orderId]);

  const fetchNotes = async () => {
    setIsLoadingNotes(true);
    try {
      const response: any = await apiClient.get(`orders/${orderId}/notes`);
      setLiveNotes(response);
      sqlite.runSync(`UPDATE orders SET notes = ?, last_updated = ? WHERE id = ?`, JSON.stringify(response), Date.now(), orderId);
    } catch (e) {
      console.error('Failed to fetch notes', e);
    } finally {
      setIsLoadingNotes(false);
    }
  };

  if (!orderData) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 justify-center items-center p-6">
        <AlertCircle size={40} color="#EF4444" />
        <Text className="text-red-400 text-sm font-bold mt-4">Order Not Found</Text>
        <Pressable 
          onPress={() => router.back()} 
          className="mt-6 bg-white border border-slate-200 px-6 py-2.5 rounded-xl active:bg-slate-150 shadow-sm"
        >
          <Text className="text-slate-900 font-bold text-xs">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const { billing, shipping, lineItems } = orderData;
  const currentStatus = optimisticStatus || orderData.status;
  const fullName = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim() || 'Guest User';

  const formatAddress = (addr: any) => {
    if (!addr) return '';
    const parts = [];
    if (addr.address_1) parts.push(addr.address_1);
    if (addr.address_2) parts.push(addr.address_2);
    const cityState = [addr.city, addr.state].filter(Boolean).join(', ');
    const cityStateZip = [cityState, addr.postcode].filter(Boolean).join(' ');
    if (cityStateZip) parts.push(cityStateZip);
    if (addr.country) parts.push(addr.country);
    return parts.join('\n');
  };
  const formattedAddress = formatAddress(billing);

  // 2. Helpers
  const handleCall = () => {
    if (billing?.phone) Linking.openURL(`tel:${billing.phone}`);
    else Alert.alert('Missing Info', 'No phone number available.');
  };
  const handleWhatsApp = () => {
    if (billing?.phone) {
      const cleanPhone = billing.phone.replace(/[^0-9]/g, '');
      Linking.openURL(`https://wa.me/${cleanPhone}`);
    } else Alert.alert('Missing Info', 'No phone number available.');
  };
  const handleEmail = () => {
    if (billing?.email) Linking.openURL(`mailto:${billing.email}?subject=Order #${orderData.number}`);
    else Alert.alert('Missing Info', 'No email address available.');
  };
  const handleCopyAddress = () => {
    const text = `${fullName}\n${formattedAddress}\nPhone: ${billing?.phone || 'N/A'}`;
    Clipboard.setString(text);
  };
  const handleCopyIndividual = (text: string, type: string) => {
    if (!text) return;
    Clipboard.setString(text);
  };
  const handleNavigate = () => {
    const query = encodeURIComponent(
      `${shipping?.address_1 || billing?.address_1 || ''}, ${shipping?.city || billing?.city || ''}, ${shipping?.country || billing?.country || ''}`
    );
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatusModalVisible(false);
    setUpdating(true);
    try {
      sqlite.runSync(`UPDATE orders SET status = ?, last_updated = ? WHERE id = ?`, newStatus, Date.now(), orderId);
      await syncQueueService.enqueue('UPDATE_ORDER', { id: orderId, status: newStatus });
      setOptimisticStatus(newStatus);
      syncQueueService.processQueue().catch(() => {});
    } catch (error) {
      console.error('Failed to queue status update:', error);
      Alert.alert('Error', 'Could not queue status update.');
    } finally {
      setUpdating(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const noteData = { note: newNote, customer_note: isCustomerNote };
      await syncQueueService.enqueue('CREATE_ORDER_NOTE', { orderId, ...noteData });
      syncQueueService.processQueue().catch(() => {});
      
      // Optimistically add to local UI
      const tempNote = {
        id: Date.now(),
        date_created: new Date().toISOString(),
        note: newNote,
        customer_note: isCustomerNote,
        author: 'You (Syncing...)',
      };
      
      const updatedNotes = [tempNote, ...liveNotes];
      setLiveNotes(updatedNotes);
      sqlite.runSync(`UPDATE orders SET notes = ?, last_updated = ? WHERE id = ?`, JSON.stringify(updatedNotes), Date.now(), orderId);
      
      setNewNote('');
      setIsCustomerNote(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = (noteId: number) => {
    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setLiveNotes(prev => prev.filter(n => n.id !== noteId));
        await syncQueueService.enqueue('DELETE_ORDER_NOTE', { orderId, noteId });
        syncQueueService.processQueue().catch(() => {});
      }}
    ]);
  };

  const handleSaveBilling = async (updatedBilling: any) => {
    try {
      const allowedKeys = ['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country', 'email', 'phone'];
      const cleanBilling: any = {};
      
      for (const key of allowedKeys) {
        if (updatedBilling[key] !== undefined && updatedBilling[key] !== null) {
          // WooCommerce REST API validates email strictly. An empty string will throw 'rest_invalid_param'.
          if (key === 'email' && typeof updatedBilling[key] === 'string' && updatedBilling[key].trim() === '') {
            continue; 
          }
          cleanBilling[key] = updatedBilling[key];
        }
      }

      await syncQueueService.enqueue('UPDATE_ORDER', { id: orderId, billing: cleanBilling });
      syncQueueService.processQueue().catch(() => {});
      // Update local with the same clean data
      sqlite.runSync(`UPDATE orders SET billing = ?, last_updated = ? WHERE id = ?`, JSON.stringify(cleanBilling), Date.now(), orderId);
      setBillingEditVisible(false);
      setRefreshKey(prev => prev + 1);
    } catch (e) {
      Alert.alert('Error', 'Failed to update billing details.');
    }
  };

  const handleSaveItems = async (updatedItems: any[]) => {
    try {
      const newTotal = updatedItems.reduce((sum, item) => sum + Number(item.total || 0), 0) + Number(orderData.shippingTotal || 0);
      
      const cleanItems = updatedItems.map(item => ({
        id: item.id,
        quantity: item.quantity,
        subtotal: String(item.subtotal),
        total: String(item.total)
      }));

      await syncQueueService.enqueue('UPDATE_ORDER', { id: orderId, line_items: cleanItems });
      syncQueueService.processQueue().catch(() => {});
      sqlite.runSync(
        `UPDATE orders SET line_items = ?, total = ?, last_updated = ? WHERE id = ?`, 
        JSON.stringify(updatedItems), newTotal.toFixed(2), Date.now(), orderId
      );
      setItemsEditVisible(false);
      setRefreshKey(prev => prev + 1);
    } catch (e) {
      Alert.alert('Error', 'Failed to update order items.');
    }
  };

  const handleSaveDiscount = async (feeName: string, feeTotal: string) => {
    try {
      const newTotal = Math.max(0, Number(orderData.total) + Number(feeTotal));
      
      await syncQueueService.enqueue('UPDATE_ORDER', { 
        id: orderId, 
        fee_lines: [{ name: feeName, total: feeTotal }] 
      });
      syncQueueService.processQueue().catch(() => {});
      
      sqlite.runSync(`UPDATE orders SET total = ?, last_updated = ? WHERE id = ?`, newTotal.toFixed(2), Date.now(), orderId);
      setDiscountEditVisible(false);
      setRefreshKey(prev => prev + 1);
    } catch (e) {
      Alert.alert('Error', 'Failed to apply discount/fee.');
    }
  };

  // PDF Generator (Truncated string matching original structure)
  const generateInvoiceHtml = () => {
    const itemsRows = lineItems.map((item: any) => `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 0; font-size: 13px;">${item.name}</td>
        <td style="padding: 10px 0; text-align: center; font-size: 13px;">${item.quantity}</td>
        <td style="padding: 10px 0; text-align: right; font-size: 13px;">$${Number(item.price).toFixed(2)}</td>
        <td style="padding: 10px 0; text-align: right; font-size: 13px; font-weight: bold;">$${Number(item.total).toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1E293B; padding: 24px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #3B82F6; padding-bottom: 16px; margin-bottom: 24px; }
            .title { font-size: 24px; font-weight: bold; color: #1E293B; }
            .meta { font-size: 12px; text-align: right; color: #64748B; line-height: 1.5; }
            .grid { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 40px; }
            .col { flex: 1; font-size: 12px; line-height: 1.6; }
            .col-title { font-weight: bold; font-size: 13px; text-transform: uppercase; color: #475569; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th { text-align: left; padding: 8px 0; font-size: 11px; text-transform: uppercase; color: #64748B; border-bottom: 1px solid #CBD5E1; }
            .summary { margin-left: auto; width: 250px; font-size: 13px; line-height: 2; }
            .summary-row { display: flex; justify-content: space-between; }
            .summary-total { font-weight: bold; font-size: 16px; color: #2563EB; border-top: 1px solid #E2E8F0; padding-top: 8px; margin-top: 8px; }
            .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #F1F5F9; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">INVOICE</div>
              <div style="font-size: 14px; font-weight: bold; margin-top: 4px; color: #475569;">Order #${orderData.number}</div>
            </div>
            <div class="meta">
              Date: ${(() => {
                if (!orderData.dateCreated) return 'Unknown';
                try {
                  const normalized = orderData.dateCreated.replace(' ', 'T');
                  const parsedDate = new Date(normalized);
                  return isNaN(parsedDate.getTime()) ? orderData.dateCreated : parsedDate.toLocaleDateString();
                } catch {
                  return orderData.dateCreated;
                }
              })()}<br/>
              Status: ${currentStatus.toUpperCase()}<br/>
              Gateway: ${orderData.paymentMethodTitle}
            </div>
          </div>

          <div class="grid">
            <div class="col">
              <div class="col-title">Billing Address</div>
              <strong>${billing?.first_name || ''} ${billing?.last_name || ''}</strong><br/>
              ${billing?.address_1 || ''}<br/>
              ${billing?.address_2 ? billing.address_2 + '<br/>' : ''}
              ${billing?.city || ''}, ${billing?.state || ''} ${billing?.postcode || ''}<br/>
              ${billing?.country || ''}<br/>
              T: ${billing?.phone || 'N/A'}<br/>
              E: ${billing?.email || 'N/A'}
            </div>
            <div class="col">
              <div class="col-title">Shipping Address</div>
              <strong>${shipping?.first_name || ''} ${shipping?.last_name || ''}</strong><br/>
              ${shipping?.address_1 || ''}<br/>
              ${shipping?.address_2 ? shipping.address_2 + '<br/>' : ''}
              ${shipping?.city || ''}, ${shipping?.state || ''} ${shipping?.postcode || ''}<br/>
              ${shipping?.country || ''}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50%;">Product Details</th>
                <th style="width: 10%; text-align: center;">Qty</th>
                <th style="width: 20%; text-align: right;">Unit Price</th>
                <th style="width: 20%; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-row">
              <span>Discounts:</span>
              <span>-$${Number(orderData.discountTotal).toFixed(2)}</span>
            </div>
            <div class="summary-row">
              <span>Shipping Fee:</span>
              <span>$${Number(orderData.shippingTotal).toFixed(2)}</span>
            </div>
            <div class="summary-row summary-total">
              <span>Net Total:</span>
              <span>$${Number(orderData.total).toFixed(2)}</span>
            </div>
          </div>

          <div class="footer">
            Thank you for shopping with us! Generated via WooPanda WooCommerce Mobile Manager.
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = async () => {
    try { await Print.printAsync({ html: generateInvoiceHtml() }); } catch (err) {}
  };
  const handleShare = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: generateInvoiceHtml() });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Invoice_Order_${orderData.number}` });
    } catch (err) {}
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processing': return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' };
      case 'completed': return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' };
      case 'pending': return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600' };
      case 'on-hold': return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600' };
      case 'cancelled': return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600' };
      case 'failed': return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700' };
      case 'refunded': return { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-600' };
      default: return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600' };
    }
  };

  const badge = getStatusBadge(currentStatus);

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={['left', 'right']}>
      
      <Stack.Screen 
        options={{ 
          title: `Order #${orderData.number}`,
          headerTitle: () => (
            <View>
              <Text className="font-black text-slate-900 text-lg">Order #{orderData.number}</Text>
              <Text className="text-slate-500 text-xs font-medium">
                {new Date(orderData.dateCreated).toLocaleString(undefined, { 
                  month: 'short', day: 'numeric', year: 'numeric', 
                  hour: 'numeric', minute: '2-digit' 
                })}
              </Text>
            </View>
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => setHistoryModalVisible(true)} className="p-2 active:opacity-50">
                <Info size={22} color="#3B82F6" />
              </Pressable>
              <Pressable onPress={() => setNotesModalVisible(true)} className="p-2 active:opacity-50">
                <StickyNote size={22} color="#3B82F6" />
              </Pressable>
            </View>
          )
        }} 
      />

      <ScrollView className="flex-grow px-5 pt-5" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        {/* TOP PRIORITY: CUSTOMER PROFILE & ORDER STATUS */}
        <View className="bg-white rounded-3xl p-5 mb-5 shadow-sm shadow-slate-200/50 border border-slate-100">
          
          <View className="flex-row justify-between items-start mb-3">
            <View className="flex-1 flex-row items-center flex-wrap gap-2 pr-4">
              <Pressable onPress={() => handleCopyIndividual(fullName, 'Name')} className="active:opacity-50">
                <Text className="text-slate-900 font-black text-2xl tracking-tight">{fullName}</Text>
              </Pressable>
              <Pressable onPress={() => setBillingEditVisible(true)} className="w-8 h-8 rounded-full bg-slate-50 items-center justify-center border border-slate-100 active:bg-slate-100">
                <Edit2 size={14} color="#64748B" />
              </Pressable>
            </View>
            <Pressable onPress={handleCopyAddress} className="p-2 active:opacity-50">
              <Copy size={20} color="#94A3B8" />
            </Pressable>
          </View>

          <Pressable onPress={() => handleCopyIndividual(formattedAddress, 'Address')} className="flex-row items-start mb-2 gap-2 active:opacity-50">
            <MapPin size={16} color="#64748B" className="mt-0.5" />
            <View className="flex-1">
              <Text className="text-slate-600 font-medium text-sm leading-relaxed">
                {formattedAddress || 'No address provided'}
              </Text>
            </View>
          </Pressable>

          {billing?.phone && (
            <Pressable onPress={() => handleCopyIndividual(billing.phone, 'Phone number')} className="flex-row items-center gap-2 mb-2 active:opacity-50">
              <Phone size={16} color="#64748B" />
              <Text className="text-slate-600 font-medium text-sm">{billing.phone}</Text>
            </Pressable>
          )}

          {billing?.email && (
            <Pressable onPress={() => handleCopyIndividual(billing.email, 'Email')} className="flex-row items-center gap-2 mb-3 active:opacity-50">
              <Mail size={16} color="#64748B" />
              <Text className="text-slate-600 font-medium text-sm">{billing.email}</Text>
            </Pressable>
          )}

          {/* Actions & Status Row */}
          <View className="flex-row items-center gap-3 pt-4 mt-2 border-t border-slate-100">
            {/* Quick Actions */}
            <View className="flex-row gap-2">
              {billing?.phone && (
                <>
                  <Pressable onPress={handleCall} className="w-11 h-11 bg-blue-50 rounded-xl items-center justify-center border border-blue-100 active:bg-blue-100">
                    <Phone size={18} color="#3B82F6" />
                  </Pressable>
                  <Pressable onPress={handleWhatsApp} className="w-11 h-11 bg-emerald-50 rounded-xl items-center justify-center border border-emerald-100 active:bg-emerald-100">
                    <MessageSquare size={18} color="#10B981" />
                  </Pressable>
                </>
              )}
              {billing?.email && (
                <Pressable onPress={handleEmail} className="w-11 h-11 bg-amber-50 rounded-xl items-center justify-center border border-amber-100 active:bg-amber-100">
                  <Mail size={18} color="#F59E0B" />
                </Pressable>
              )}
            </View>

            {/* Status Dropdown */}
            <Pressable 
              onPress={() => setStatusModalVisible(true)}
              className={`flex-1 flex-row justify-between items-center h-11 px-4 rounded-xl border ${badge.bg} ${badge.border}`}
            >
              <Text className={`font-bold text-sm uppercase tracking-wider ${badge.text}`}>
                {currentStatus}
              </Text>
              <ChevronDown size={16} className={badge.text} />
            </Pressable>
          </View>
        </View>

        {/* 3. RECEIPT STYLE PRODUCTS LIST */}
        <View className="bg-white rounded-3xl p-6 mb-5 shadow-sm shadow-slate-200/50 border border-slate-100">
          <View className="flex-row items-center justify-between mb-5">
            <View className="flex-row items-center gap-2">
              <Text className="text-slate-900 font-black text-lg">Order Items</Text>
              <Pressable onPress={() => setItemsEditVisible(true)} className="w-7 h-7 rounded-full bg-slate-50 items-center justify-center border border-slate-100 active:bg-slate-100">
                <Edit2 size={12} color="#64748B" />
              </Pressable>
            </View>
            <Text className="text-slate-400 font-medium text-xs">{lineItems.length} items</Text>
          </View>
          
          <View className="border-t border-slate-100 pt-4 mb-4 gap-4">
            {lineItems.map((item: any) => (
              <View key={item.id} className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 pr-4">
                  {item.image?.src ? (
                    <Image 
                      source={{ uri: item.image.src }} 
                      style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#F8FAFC' }} 
                      contentFit="cover" 
                    />
                  ) : (
                    <View className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 items-center justify-center">
                      <ShoppingBag size={20} color="#94A3B8" />
                    </View>
                  )}
                  <View className="ml-3 flex-1">
                    <Text className="text-slate-800 font-bold text-sm leading-tight mb-1" numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text className="text-slate-500 font-medium text-xs">
                      {getCurrencySymbol(orderData.currency)}{Number(item.price).toFixed(2)}  x {item.quantity}
                    </Text>
                  </View>
                </View>
                <Text className="text-slate-900 font-black text-sm">
                  {getCurrencySymbol(orderData.currency)}{Number(item.total).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>

          {/* Receipt Summary */}
          {(() => {
            const itemsTotalAfterCoupons = lineItems.reduce((sum: number, item: any) => sum + Number(item.total || 0), 0);
            const discountTotal = Number(orderData.discountTotal || 0);
            const itemsSubtotal = itemsTotalAfterCoupons + discountTotal;
            
            const shippingTotal = Number(orderData.shippingTotal || 0);
            const netTotal = Number(orderData.total || 0);
            
            const expectedTotal = itemsTotalAfterCoupons + shippingTotal;
            const feeTotal = netTotal - expectedTotal;

            return (
              <View className="bg-slate-50 rounded-2xl p-4 gap-3">
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 font-medium text-sm">Subtotal</Text>
                  <Text className="text-slate-700 font-bold text-sm">
                    {getCurrencySymbol(orderData.currency)}{itemsSubtotal.toFixed(2)}
                  </Text>
                </View>
                
                {discountTotal > 0 && (
                  <View className="flex-row justify-between">
                    <Text className="text-emerald-500 font-medium text-sm">Coupons / Discounts</Text>
                    <Text className="text-emerald-600 font-bold text-sm">-{getCurrencySymbol(orderData.currency)}{discountTotal.toFixed(2)}</Text>
                  </View>
                )}
                
                {Math.abs(feeTotal) > 0.01 && (
                  <View className="flex-row justify-between">
                    <Text className={feeTotal < 0 ? "text-emerald-500 font-medium text-sm" : "text-amber-500 font-medium text-sm"}>
                      {feeTotal < 0 ? 'Manual Discount' : 'Manual Fee'}
                    </Text>
                    <Text className={feeTotal < 0 ? "text-emerald-600 font-bold text-sm" : "text-amber-600 font-bold text-sm"}>
                      {feeTotal < 0 ? '-' : '+'}{getCurrencySymbol(orderData.currency)}{Math.abs(feeTotal).toFixed(2)}
                    </Text>
                  </View>
                )}
                
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 font-medium text-sm">Shipping</Text>
                  <Text className="text-slate-700 font-bold text-sm">
                    {shippingTotal > 0 ? `${getCurrencySymbol(orderData.currency)}${shippingTotal.toFixed(2)}` : 'Free'}
                  </Text>
                </View>
                
                <View className="h-px bg-slate-200 my-1" />
                
                <View className="flex-row justify-between pt-3 mt-2 border-t border-slate-200/60 items-center">
                  <Text className="text-slate-900 font-black text-base uppercase tracking-wider">Net Total</Text>
                  <Text className="text-slate-900 font-black text-xl">
                    {getCurrencySymbol(orderData.currency)}{netTotal.toFixed(2)}
                  </Text>
                </View>
              </View>
            );
          })()}

          <Pressable 
            onPress={() => setDiscountEditVisible(true)}
            className="mt-4 flex-row justify-center items-center h-12 bg-white rounded-xl border border-slate-200 border-dashed active:bg-slate-50"
          >
            <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider">Apply Discount / Fee</Text>
          </Pressable>
        </View>

        {/* 4. PAYMENT METHOD */}
        <View className="bg-white rounded-3xl p-5 mb-5 shadow-sm shadow-slate-200/50 border border-slate-100 flex-row items-center gap-4">
          <View className="w-12 h-12 bg-slate-50 rounded-2xl items-center justify-center border border-slate-100">
            <CreditCard size={20} color="#64748B" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-0.5">Payment Gateway</Text>
            <Text className="text-slate-800 font-bold text-sm">{orderData.paymentMethodTitle}</Text>
          </View>
        </View>

      </ScrollView>

      {/* FIXED BOTTOM ACTION BAR */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-5 py-4 pb-8 flex-row gap-3 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        <Pressable 
          onPress={handlePrint}
          className="flex-1 bg-slate-100 h-14 rounded-2xl flex-row items-center justify-center gap-2 active:bg-slate-200"
        >
          <Printer size={18} color="#475569" />
          <Text className="text-slate-800 font-bold text-sm">Print Invoice</Text>
        </Pressable>
        <Pressable 
          onPress={handleShare}
          className="flex-1 bg-slate-900 h-14 rounded-2xl flex-row items-center justify-center gap-2 active:bg-slate-800 shadow-md shadow-slate-900/20"
        >
          <Share2 size={18} color="#FFFFFF" />
          <Text className="text-white font-bold text-sm">Share PDF</Text>
        </Pressable>
      </View>

      {/* Status Picker Modal */}
      <Modal visible={statusModalVisible} transparent animationType="slide" onRequestClose={() => setStatusModalVisible(false)}>
        <View className="flex-1 justify-end">
          <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} onPress={() => setStatusModalVisible(false)} />
          <View className="bg-white rounded-t-3xl p-6 pb-10">
            <Text className="text-slate-900 font-black text-xl mb-6 text-center tracking-tight">Update Status</Text>
            <View className="gap-3">
              {orderStatuses.map((statusItem) => (
                <Pressable
                  key={statusItem.value}
                  onPress={() => handleStatusChange(statusItem.value)}
                  className={`h-14 rounded-2xl items-center justify-center border-2 ${
                    currentStatus === statusItem.value 
                      ? 'bg-blue-50 border-blue-500' 
                      : 'bg-white border-slate-100 active:bg-slate-50'
                  }`}
                >
                  <Text className={`text-sm font-black uppercase tracking-wider ${
                    currentStatus === statusItem.value ? 'text-blue-600' : 'text-slate-600'
                  }`}>
                    {statusItem.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => setStatusModalVisible(false)}
              className="mt-6 p-4 items-center justify-center active:opacity-50"
            >
              <Text className="text-slate-500 font-bold text-sm">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* NOTES MODAL */}
      <Modal visible={notesModalVisible} animationType="slide" transparent onRequestClose={() => setNotesModalVisible(false)}>
        <View className="flex-1 justify-end">
          <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} onPress={() => setNotesModalVisible(false)} />
          <View className="bg-white rounded-t-3xl h-[80%]">
            <View className="flex-row justify-between items-center p-5 border-b border-slate-100">
              <Text className="text-xl font-black text-slate-900">Order Notes</Text>
              <Pressable onPress={() => setNotesModalVisible(false)} className="p-2 bg-slate-100 rounded-full">
                <ArrowLeft size={20} color="#64748B" style={{ transform: [{ rotate: '-90deg' }] }} />
              </Pressable>
            </View>

            <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
              {isLoadingNotes && liveNotes.length === 0 ? (
                <View className="items-center justify-center py-10">
                  <ActivityIndicator size="large" color="#3B82F6" />
                  <Text className="text-slate-400 mt-4 font-medium">Fetching notes from WooCommerce...</Text>
                </View>
              ) : liveNotes && liveNotes.length > 0 ? (
                liveNotes.map((note: any) => (
                  <View key={note.id} className={`p-4 rounded-2xl mb-4 ${note.customer_note ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50 border border-slate-100'}`}>
                    <View className="flex-row justify-between mb-2">
                      <Text className={`font-bold text-xs ${note.customer_note ? 'text-blue-600' : 'text-slate-500'}`}>
                        {note.customer_note ? 'Customer Note' : 'Private Note'}
                      </Text>
                      <View className="flex-row items-center gap-3">
                        <Text className="text-slate-400 font-medium text-xs">
                          {new Date(note.date_created).toLocaleDateString()}
                        </Text>
                        <Pressable onPress={() => handleDeleteNote(note.id)} className="active:opacity-50">
                          <Trash2 size={16} color="#EF4444" opacity={0.7} />
                        </Pressable>
                      </View>
                    </View>
                    <Text className="text-slate-700 text-sm leading-relaxed">{note.note}</Text>
                    <Text className="text-slate-400 text-xs mt-2 italic">By: {note.author}</Text>
                  </View>
                ))
              ) : (
                <View className="items-center justify-center py-10">
                  <StickyNote size={40} color="#CBD5E1" />
                  <Text className="text-slate-400 font-medium mt-4">No notes for this order yet.</Text>
                </View>
              )}
            </ScrollView>

            <View className="p-5 border-t border-slate-100 bg-white pb-8">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-slate-700 font-bold">Add Note</Text>
                <Pressable 
                  onPress={() => setIsCustomerNote(!isCustomerNote)}
                  className={`px-3 py-1.5 rounded-lg border ${isCustomerNote ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}
                >
                  <Text className={`text-xs font-bold ${isCustomerNote ? 'text-blue-600' : 'text-slate-500'}`}>
                    {isCustomerNote ? 'To Customer' : 'Private'}
                  </Text>
                </Pressable>
              </View>
              
              <View className="bg-slate-50 rounded-2xl border border-slate-200 p-1 flex-row">
                <View className="flex-1 px-3 py-2">
                  <TextInput
                    value={newNote}
                    onChangeText={setNewNote}
                    placeholder="Type note here..."
                    className="text-slate-700 text-sm h-12"
                    multiline
                  />
                </View>
                <Pressable 
                  onPress={handleAddNote}
                  disabled={addingNote || !newNote.trim()}
                  className={`w-14 h-12 rounded-xl items-center justify-center ${newNote.trim() && !addingNote ? 'bg-blue-600' : 'bg-slate-300'}`}
                >
                  {addingNote ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text className="text-white font-bold text-xs uppercase tracking-wider">Add</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      {/* ORDER HISTORY MODAL */}
      <Modal visible={historyModalVisible} animationType="slide" transparent onRequestClose={() => setHistoryModalVisible(false)}>
        <View className="flex-1 justify-end">
          <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} onPress={() => setHistoryModalVisible(false)} />
          <View className="bg-white rounded-t-3xl h-[80%]">
            <View className="flex-row justify-between items-center p-5 border-b border-slate-100">
              <Text className="text-xl font-black text-slate-900">Customer History</Text>
              <Pressable onPress={() => setHistoryModalVisible(false)} className="p-2 bg-slate-100 rounded-full">
                <ArrowLeft size={20} color="#64748B" style={{ transform: [{ rotate: '-90deg' }] }} />
              </Pressable>
            </View>

            <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
              
              {customerOrders.length > 0 && (
                <View className="flex-row gap-3 mb-6">
                  <View className="flex-1 bg-blue-50 p-4 rounded-2xl border border-blue-100">
                    <Text className="text-blue-500 font-bold text-xs uppercase tracking-wider mb-1">Total Orders</Text>
                    <Text className="text-blue-700 font-black text-2xl">{customerOrders.length}</Text>
                  </View>
                  <View className="flex-1 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                    <Text className="text-emerald-500 font-bold text-xs uppercase tracking-wider mb-1">Total Revenue</Text>
                    <Text className="text-emerald-700 font-black text-2xl">
                      {getCurrencySymbol(orderData?.currency)}{customerOrders.reduce((sum, o) => sum + Number(o.total || 0), 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}

              <Text className="text-slate-900 font-black text-lg mb-4">
                Order History ({orderData?.billing?.email || 'Guest'})
              </Text>
              {customerOrders.length > 0 ? (
                customerOrders.map((histOrder: any) => (
                  <Pressable 
                    key={histOrder.id}
                    onPress={() => {
                      setHistoryModalVisible(false);
                      router.navigate(`/orders/${histOrder.id}`);
                    }}
                    className="flex-row items-center justify-between bg-slate-50 p-4 rounded-2xl mb-3 border border-slate-100 active:bg-slate-100"
                  >
                    <View>
                      <Text className="font-bold text-slate-900 text-base mb-1">Order #{histOrder.number}</Text>
                      <Text className="text-slate-500 text-xs font-medium capitalize">{histOrder.status}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="font-black text-slate-900 text-sm mb-1">
                        {getCurrencySymbol(histOrder.currency)}{Number(histOrder.total).toFixed(2)}
                      </Text>
                      <Text className="text-slate-400 text-xs">
                        {new Date(histOrder.dateCreated).toLocaleDateString()}
                      </Text>
                    </View>
                  </Pressable>
                ))
              ) : (
                <View className="items-center justify-center py-10">
                  <Info size={40} color="#CBD5E1" />
                  <Text className="text-slate-400 font-medium mt-4">No other orders found for this customer.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* EDIT MODALS */}
      <BillingEditModal 
        visible={billingEditVisible} 
        onClose={() => setBillingEditVisible(false)} 
        billingData={orderData.billing} 
        onSave={handleSaveBilling} 
      />
      
      <LineItemsEditModal 
        visible={itemsEditVisible} 
        onClose={() => setItemsEditVisible(false)} 
        lineItems={orderData.lineItems} 
        currency={orderData.currency}
        onSave={handleSaveItems} 
      />
      
      <DiscountEditModal 
        visible={discountEditVisible} 
        onClose={() => setDiscountEditVisible(false)} 
        currency={orderData.currency}
        onSave={handleSaveDiscount} 
      />
    </SafeAreaView>
  );
}
