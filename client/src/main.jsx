import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, ShoppingBag, ArrowUpRight, Plus, Minus, X, Menu, Check, ShieldCheck, Truck, RotateCcw, PackageCheck, UserRound } from 'lucide-react';
import './styles.css';
const RAW = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const API = RAW.includes('/api') ? RAW : RAW + '/api';

const fallbackProducts = [
 {id:1,name:'Studio Wireless Headphones',category:'Tech',description:'Immersive sound, comfortable fit and all-day battery life. Tuned by Urban Cart Studio.',price:1299,image_url:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85',stock:25},
 {id:2,name:'Minimal Desk Lamp',category:'Home',description:'A warm, modern lamp for your workspace or bedside table. Concrete base, warm light.',price:649,image_url:'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85',stock:18},
 {id:3,name:'Everyday Canvas Backpack',category:'Lifestyle',description:'A durable everyday backpack with a clean, versatile design. Waxed canvas.',price:899,image_url:'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85',stock:20},
 {id:4,name:'Classic Sunglasses',category:'Accessories',description:'Timeless frames made for sunny days and daily wear. Polarized.',price:499,image_url:'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85',stock:30},
 {id:5,name:'Smart Watch',category:'Tech',description:'Track your activity and stay connected throughout the day. AMOLED.',price:1599,image_url:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85',stock:12},
 {id:6,name:'Ceramic Coffee Set',category:'Home',description:'A considered ceramic set for your everyday coffee ritual. Matte glaze.',price:379,image_url:'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85',stock:16},
 {id:7,name:'Everyday Sneakers',category:'Lifestyle',description:'Comfort-first sneakers with a simple, versatile silhouette. Cloud sole.',price:1099,image_url:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85',stock:14},
 {id:8,name:'Reusable Travel Bottle',category:'Accessories',description:'A reusable bottle to keep your favourite drink close at hand. Double wall.',price:249,image_url:'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85',stock:40}
];
const fmt = n => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:2}).format(Number(n||0));
async function api(path, options={}) { 
  const token=localStorage.getItem('uc_token'); 
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(options.headers||{})}}); 
  const data=await res.json().catch(()=>({})); 
  if(!res.ok) throw new Error(data.error||`Request failed: ${res.status}`); 
  return data; 
}
function App(){
 const [products,setProducts]=useState(fallbackProducts),[category,setCategory]=useState('All'),[search,setSearch]=useState(''),[cart,setCart]=useState(()=>JSON.parse(localStorage.getItem('uc_cart')||'[]')),[cartOpen,setCartOpen]=useState(false),[checkoutOpen,setCheckoutOpen]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[menuOpen,setMenuOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false),[authMode,setAuthMode]=useState('login'),[user,setUser]=useState(()=>JSON.parse(localStorage.getItem('uc_user')||'null')),[orders,setOrders]=useState([]),[adminOpen,setAdminOpen]=useState(false),[adminOrders,setAdminOrders]=useState([]),[busy,setBusy]=useState(false),[selectedProduct,setSelectedProduct]=useState(null),[showAll,setShowAll]=useState(false);
 const [form,setForm]=useState({customer_name:'',email:'',phone:'',address:'',city:'',province:'Gauteng',postal_code:''});
 const [authForm,setAuthForm]=useState({name:'',email:'',password:''});
 const [adminTab,setAdminTab]=useState('orders');
 const [prodForm,setProdForm]=useState({name:'',category:'Tech',price:'',stock:'',description:'',image_url:''});
 const [editingId,setEditingId]=useState(null);
 const categories=['All','Tech','Home','Lifestyle','Accessories'];
 useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get('payment')==='return'){ setCart([]); localStorage.removeItem('lastOrderId'); setNotice(`Payment successful! Order #${params.get('order')} received.`); }
    if(params.get('payment')==='cancel'){ setNotice('Payment cancelled - your cart is saved.'); }
 },[]);
 useEffect(()=>{localStorage.setItem('uc_cart',JSON.stringify(cart));},[cart]);
 useEffect(()=>{api('/products').then((rows)=>{ if(Array.isArray(rows)&&rows.length) setProducts(rows); }).catch(()=>{}).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(user){setForm(f=>({...f,customer_name:f.customer_name||user.name,email:f.email||user.email}));api('/orders/mine').then(setOrders).catch(()=>{});}},[user]);
 useEffect(()=>{if(notice){const t=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(t);}},[notice]);
 const visible=useMemo(()=>products.filter(p=>(category==='All'|| (p.category||'').toLowerCase()===category.toLowerCase())&& `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(search.toLowerCase())),[products,category,search]);
 const count=cart.reduce((s,p)=>s+p.quantity,0),total=cart.reduce((s,p)=>s+p.price*p.quantity,0);
 const setField=(k,v)=>setForm(f=>({...f,[k]:v}));
 function add(p){setCart(old=>{const found=old.find(x=>x.id===p.id);return found?old.map(x=>x.id===p.id?{...x,quantity:Math.min(x.quantity+1,99)}:x):[...old,{...p,quantity:1}]});setNotice(`${p.name} added to bag`);}
 function changeQty(id,d){setCart(old=>old.map(p=>p.id===id?{...p,quantity:p.quantity+d}:p).filter(p=>p.quantity>0));}
 function openProduct(p){ setSelectedProduct(p); setShowAll(false); window.scrollTo({top:0, behavior:'smooth'}); }
 function closeProduct(){ setSelectedProduct(null); }
 async function submitAuth(e){
  e.preventDefault(); setBusy(true);
  try{const data=await api(`/auth/${authMode}`,{method:'POST',body:JSON.stringify(authForm)});
  localStorage.setItem('uc_token',data.token);localStorage.setItem('uc_user',JSON.stringify(data.user));
  setUser(data.user);setAccountOpen(false); setNotice(`Welcome${data.user.name?`, ${data.user.name.split(' ')[0]}`:''}!`); setAuthForm({name:'',email:'',password:''});}
 catch(e){setNotice(e.message);}finally{setBusy(false);} }
 function logout(){localStorage.removeItem('uc_token');localStorage.removeItem('uc_user');setUser(null);setOrders([]);setAdminOpen(false);setNotice('You have signed out.');}
 async function placeOrder(e) {
  e.preventDefault();
  if(!form.customer_name.trim()||!form.email.trim()||!form.phone.trim()||!form.address.trim()||!form.city.trim()||!form.postal_code.trim()){ setNotice('Please fill in all delivery fields.'); return; }
  setBusy(true); setNotice('');
  try {
    const order = await api('/orders',{method:'POST',body:JSON.stringify({...form,items: cart.map(p => ({ id: p.id, quantity: p.quantity }))})});
    const pay = await api('/payfast/checkout',{method:'POST',body:JSON.stringify({ orderId: order.orderId })});
    if (!pay.action || !pay.fields) throw new Error('PayFast is not configured yet on server');
    localStorage.setItem('lastOrderId', order.orderId);
    const formEl = document.createElement('form'); formEl.method='POST'; formEl.action=pay.action; formEl.style.display='none';
    Object.entries(pay.fields).forEach(([name, value]) => { const input=document.createElement('input'); input.type='hidden'; input.name=name; input.value=String(value ?? ''); formEl.appendChild(input); });
    document.body.appendChild(formEl); setCheckoutOpen(false); formEl.submit();
  } catch (err) { setNotice(err.message || 'Could not start PayFast checkout.'); } finally { setBusy(false); }
}
 async function createProduct(e){
    e.preventDefault();
    try{
      const payload={...prodForm, price:Number(prodForm.price), stock:Number(prodForm.stock)};
      const p = await api('/admin/products',{method:'POST', body:JSON.stringify(payload)});
      setProducts(old=>[p,...old]); setNotice('Product created'); setProdForm({name:'',category:'Tech',price:'',stock:'',description:'',image_url:''});
    }catch(err){setNotice(err.message)}
  }
  async function saveEdit(e){
    e.preventDefault();
    try{
      const payload={...prodForm, price:Number(prodForm.price), stock:Number(prodForm.stock)};
      const p = await api(`/admin/products/${editingId}`,{method:'PUT', body:JSON.stringify(payload)});
      setProducts(old=>old.map(x=>x.id===editingId? p : x));
      setEditingId(null); setProdForm({name:'',category:'Tech',price:'',stock:'',description:'',image_url:''}); setNotice('Product updated');
    }catch(err){setNotice(err.message)}
  }
  function startEdit(p){
    setEditingId(p.id);
    setProdForm({name:p.name, category:p.category||'Tech', price:String(p.price), stock:String(p.stock), description:p.description, image_url:p.image_url});
    setAdminTab('products');
  }
  async function deleteProduct(id){
    if(!confirm('Delete this product?')) return;
    try{
      await api(`/admin/products/${id}`,{method:'DELETE'});
      setProducts(old=>old.filter(x=>x.id!==id)); setNotice('Product deleted');
    }catch(err){setNotice(err.message)}
  }
 async function showAdmin(){try{const data=await api('/admin/orders');setAdminOrders(data);setAdminOpen(true);}catch(e){setNotice(e.message);}}
 async function updateStatus(id,status){try{await api(`/admin/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});setAdminOrders(old=>old.map(o=>o.id===id?{...o,status}:o));}catch(e){setNotice(e.message);}}
 const isHome = !selectedProduct && !showAll;
 return <div className="app">
  <div className="ticker"><div className="ticker-track"><span>● FREE DELIVERY OVER R1,000 ● SECURE PAYFAST ● CURATED IN SA ● EVERYDAY ELEVATED ●</span><span>● FREE DELIVERY OVER R1,000 ● SECURE PAYFAST ● CURATED IN SA ● EVERYDAY ELEVATED ●</span></div></div>
  <header className="header">
    <div className="header-left">
      <button className="icon-btn mobile-only" onClick={()=>setMenuOpen(!menuOpen)}><Menu size={20}/></button>
      <a className="brand" href="#" onClick={()=>{setCategory('All');setSearch('');closeProduct();setShowAll(false);}}>
        <span className="brand-mark">U</span> URBAN CART <i>®</i>
      </a>
      <nav className={menuOpen?'nav open':'nav'}>
        <a onClick={()=>{setShowAll(false); closeProduct(); setCategory('All'); setMenuOpen(false); window.scrollTo(0,0)}}>HOME</a>
        <a onClick={()=>{setShowAll(true); closeProduct(); setMenuOpen(false); window.scrollTo(0,0)}}>INDEX</a>
        <a onClick={()=>{setCategory('Tech');closeProduct();setShowAll(false);setMenuOpen(false)}}>TECH</a>
        <a onClick={()=>{setCategory('Home');closeProduct();setShowAll(false);setMenuOpen(false)}}>HOME</a>
        <a href="#story" onClick={()=>setMenuOpen(false)}>MANIFESTO</a>
      </nav>
    </div>
    <div className="header-right">
      <label className="search-pill"><Search size={14}/><input value={search} onChange={e=>{setSearch(e.target.value); if(selectedProduct){closeProduct()}}} placeholder="SEARCH"/><kbd>⌘K</kbd></label>
      <button className="circle-btn" onClick={()=>setAccountOpen(true)}><UserRound size={16}/></button>
      <button className="bag-pill" onClick={()=>setCartOpen(true)}><ShoppingBag size={14}/> BAG <b>{count}</b></button>
    </div>
  </header>
  <main>
    {selectedProduct ? (
      <div className="product-view">
        <div className="product-view-left">
          <img src={selectedProduct.image_url} alt={selectedProduct.name}/>
          <div className="img-meta"><span>{selectedProduct.category}</span><span>{selectedProduct.stock} IN STOCK</span></div>
        </div>
        <div className="product-view-right">
          <button className="close-view" onClick={closeProduct}><X size={14}/> CLOSE</button>
          <h1>{selectedProduct.name}</h1>
          <p className="desc">{selectedProduct.description}</p>
          <div className="price-row"><strong>{fmt(selectedProduct.price)}</strong><span>ZAR • VAT INCL.</span></div>
          <div className="buy-row">
            <button className="btn-black" onClick={()=>{add(selectedProduct);}}>
              ADD TO BAG — {fmt(selectedProduct.price)} <ArrowUpRight size={16}/>
            </button>
            <button className="btn-ghost" onClick={()=>setCartOpen(true)}>View bag ({count})</button>
          </div>
          <div className="micro-badges">
            <span><Truck size={14}/> 2-4 DAY DELIVERY</span>
            <span><ShieldCheck size={14}/> PAYFAST SECURE</span>
            <span><RotateCcw size={14}/> 14-DAY RETURNS</span>
          </div>
        </div>
      </div>
    ) : showAll ? (
      <>
        <section className="shop">
          <div className="shop-head">
            <h2>FULL INDEX <span>({visible.length})</span></h2>
            <button className="btn-ghost" onClick={()=>{setShowAll(false); window.scrollTo(0,0)}}><X size={14}/> BACK TO HOME</button>
          </div>
          <div className="grid all-mode">
            {visible.map((p)=>
              <article key={p.id} className="card" onClick={()=>openProduct(p)}>
                <div className="card-img"><img src={p.image_url} alt={p.name} loading="lazy"/><span className="tag">{p.category}</span><button className="add" onClick={e=>{e.stopPropagation(); add(p);}}><Plus size={16}/></button></div>
                <div className="card-info"><div><h3>{p.name}</h3><small>{p.category}</small></div><b>{fmt(p.price)}</b></div>
              </article>
            )}
          </div>
        </section>
      </>
    ) : (
      <>
        <section className="hero-grid">
          <div className="hero-manifesto">
            <h1>FIND<br/>YOUR<br/>KIND<br/><em>OF GOOD.</em></h1>
            <p>Not another store. A tight edit of useful, well-made things that earn their place. No filler. No endless scroll.</p>
            <div className="hero-actions">
              <a href="#shop" className="btn-black">SHOP THE INDEX <ArrowUpRight size={16}/></a>
              <div className="hero-stat"><b>{products.length}</b><span>OBJECTS<br/>CURATED</span></div>
            </div>
          </div>
          <div className="hero-cards">
            <div className="hero-big-card">
              <img src="https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=1200&q=85" alt=""/>
              <div className="card-overlay"><span>THE NEW STANDARD</span><strong>Little things.<br/>Big difference.</strong></div>
            </div>
            <div className="hero-small-cards">
              <div className="mini-card"><PackageCheck size={18}/><strong>CURATED</strong><small>Not everything. Just the good stuff.</small></div>
              <div className="mini-card dark"><Truck size={18}/><strong>DELIVERED</strong><small>Tracked across SA. No surprises.</small></div>
            </div>
          </div>
        </section>
        <section id="shop" className="shop">
          <div className="shop-head">
            <h2>INDEX <span>({visible.length})</span></h2>
            <div className="tabs">
              {categories.map(c=><button key={c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c.toUpperCase()}</button>)}
            </div>
            <button className="view-all" onClick={()=>{setShowAll(true); window.scrollTo(0,0)}}>VIEW EVERYTHING <ArrowUpRight size={14}/></button>
          </div>
          {loading&&<div className="loading">LOADING INDEX...</div>}
          {!loading&&!visible.length&&<div className="empty">NO RESULTS FOR "{search}" <button onClick={()=>{setSearch('');setCategory('All')}}>CLEAR</button></div>}
          <div className="grid">
            {visible.map((p,i)=>
              <article key={p.id} className={i===0?"card big":"card"} onClick={()=>openProduct(p)}>
                <div className="card-img"><img src={p.image_url} alt={p.name} loading="lazy"/><span className="tag">{i===0?'BESTSELLER':p.category}</span><button className="add" onClick={e=>{e.stopPropagation(); add(p);}}><Plus size={16}/></button></div>
                <div className="card-info"><div><h3>{p.name}</h3><small>{p.category}</small></div><b>{fmt(p.price)}</b></div>
              </article>
            )}
          </div>
        </section>
        <section id="story" className="manifesto">
          <div><h2>LESS NOISE.<br/>MORE<br/><em>MEANING.</em></h2></div>
          <div><p>Urban Cart started with one question: what if we only sold things we'd keep?</p><p>We don't do 10,000 products. We do 30 that matter. Tech that doesn't shout. Homeware that lasts. Everyday stuff that makes the day feel a little more considered.</p><p>Proudly built in Soweto. Shipping everywhere in South Africa.</p><a href="#shop" className="btn-outline">READ OUR RULES <ArrowUpRight size={14}/></a></div>
        </section>
      </>
    )}
  </main>
  <footer className="footer">
    <div className="foot-top"><span>© {new Date().getFullYear()} URBAN CART</span><span>SOWETO — JHB — SA</span><span>MADE FOR THE EVERYDAY ●</span></div>
    <div className="foot-big">URBAN CART</div>
  </footer>
  {notice&&<div className="toast"><Check size={14}/>{notice}<button onClick={()=>setNotice('')}><X size={12}/></button></div>}
  {cartOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCartOpen(false)}}>
    <aside className="drawer">
      <div className="drawer-head"><h2>BAG ({count})</h2><button onClick={()=>setCartOpen(false)}><X size={16}/></button></div>
      {!cart.length?<div className="empty-bag"><ShoppingBag size={28}/><h3>Bag is empty.</h3><p>Go add some good stuff.</p><button className="btn-black" onClick={()=>setCartOpen(false)}>SHOP NOW</button></div>:
      <>
        <div className="cart-list">{cart.map(p=><div key={p.id} className="cart-item"><img src={p.image_url}/><div><h4>{p.name}</h4><b>{fmt(p.price)}</b><div className="qty"><button onClick={()=>changeQty(p.id,-1)}><Minus size={10}/></button><span>{p.quantity}</span><button onClick={()=>changeQty(p.id,1)}><Plus size={10}/></button></div></div><button className="remove" onClick={()=>setCart(old=>old.filter(x=>x.id!==p.id))}>REMOVE</button></div>)}</div>
        <div className="cart-foot"><div className="sum"><span>SUBTOTAL</span><b>{fmt(total)}</b></div><button className="btn-black full" onClick={()=>{setCartOpen(false);setCheckoutOpen(true)}}>CHECKOUT — {fmt(total)} <ArrowUpRight size={14}/></button></div>
      </>}
    </aside>
  </div>}
  {checkoutOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCheckoutOpen(false)}}>
    <section className="modal">
      <div className="drawer-head"><h2>CHECKOUT</h2><button onClick={()=>setCheckoutOpen(false)}><X size={16}/></button></div>
      <form onSubmit={placeOrder} className="checkout-form">
        <input required placeholder="Full name" value={form.customer_name} onChange={e=>setField('customer_name',e.target.value)}/>
        <input required type="email" placeholder="Email" value={form.email} onChange={e=>setField('email',e.target.value)}/>
        <input required placeholder="Phone" value={form.phone} onChange={e=>setField('phone',e.target.value)}/>
        <input required placeholder="Street address" className="wide" value={form.address} onChange={e=>setField('address',e.target.value)}/>
        <input required placeholder="City" value={form.city} onChange={e=>setField('city',e.target.value)}/>
        <select required value={form.province} onChange={e=>setField('province',e.target.value)}>{['Gauteng','Eastern Cape','Free State','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'].map(p=><option key={p}>{p}</option>)}</select>
        <input required placeholder="Postal code" value={form.postal_code} onChange={e=>setField('postal_code',e.target.value)}/>
        <button className="btn-black full wide" disabled={busy||!cart.length}>{busy?'PREPARING...':`PAY WITH PAYFAST — ${fmt(total)}`} <ShieldCheck size={14}/></button>
      </form>
    </section>
  </div>}
  {accountOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAccountOpen(false)}}>
    <section className="modal">
      <div className="drawer-head"><h2>{user?user.name.toUpperCase():authMode==='login'?'SIGN IN':'CREATE ACCOUNT'}</h2><button onClick={()=>setAccountOpen(false)}><X size={16}/></button></div>
      {user?<div className="account">
        <div className="avatar">{user.name[0]}</div><h3>{user.name}</h3><p>{user.email}</p>
        <div className="orders">{orders.map(o=><div key={o.id} className="order-line"><span>#{o.id} • {new Date(o.created_at).toLocaleDateString()}</span><b>{fmt(o.total)} — {o.status}</b></div>)}</div>
        <button className="btn-outline full" onClick={logout}>SIGN OUT</button>
        {user.role==='admin'&&<button className="btn-black full" style={{marginTop:8}} onClick={()=>{setAccountOpen(false);showAdmin()}}>ADMIN ORDERS</button>}
      </div>:<>
        <div className="auth-switch"><button className={authMode==='login'?'on':''} onClick={()=>setAuthMode('login')}>LOGIN</button><button className={authMode==='register'?'on':''} onClick={()=>setAuthMode('register')}>REGISTER</button></div>
        <form onSubmit={submitAuth} className="auth-form">
          {authMode==='register'&&<input required placeholder="Full name" value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))}/>}
          <input required type="email" placeholder="Email" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))}/>
          <input required type="password" placeholder="Password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))}/>
          <button className="btn-black full">{busy?'WAIT...':authMode==='login'?'SIGN IN':'CREATE ACCOUNT'}</button>
        </form>
      </>}
    </section>
  </div>}
  {adminOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAdminOpen(false)}}>
    <section className="modal wide-modal">
      <div className="drawer-head"><h2>ADMIN — {adminTab.toUpperCase()}</h2><button onClick={()=>setAdminOpen(false)}><X size={16}/></button></div>
      <div className="auth-switch">
        <button className={adminTab==='orders'?'on':''} onClick={()=>setAdminTab('orders')}>ORDERS ({adminOrders.length})</button>
        <button className={adminTab==='products'?'on':''} onClick={()=>setAdminTab('products')}>PRODUCTS ({products.length})</button>
      </div>
      {adminTab==='orders' ? (
        <div style={{maxHeight:'60vh', overflow:'auto'}}>
          {adminOrders.map(o=><div key={o.id} className="admin-row"><div><b>#{o.id} {o.customer_name}</b><small>{o.email} — {fmt(o.total)}</small></div><select value={o.status} onChange={e=>updateStatus(o.id,e.target.value)}>{['pending','paid','processing','shipped','cancelled'].map(s=><option key={s}>{s}</option>)}</select></div>)}
          {!adminOrders.length && <div className="empty">NO ORDERS YET</div>}
        </div>
      ) : (
        <div>
          <form onSubmit={editingId? saveEdit : createProduct} className="auth-form" style={{padding:16, border:'2px solid var(--ink)', background:'#fff'}}>
            <h3 style={{fontFamily:'Anton', margin:'0 0 8px'}}>{editingId? `EDIT #${editingId}` : 'CREATE NEW PRODUCT'}</h3>
            <input required placeholder="Name" value={prodForm.name} onChange={e=>setProdForm(f=>({...f,name:e.target.value}))}/>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
              <select value={prodForm.category} onChange={e=>setProdForm(f=>({...f,category:e.target.value}))}>
                {['Tech','Home','Lifestyle','Accessories'].map(c=><option key={c}>{c}</option>)}
              </select>
              <input required type="number" step="0.01" placeholder="Price ZAR" value={prodForm.price} onChange={e=>setProdForm(f=>({...f,price:e.target.value}))}/>
              <input required type="number" placeholder="Stock" value={prodForm.stock} onChange={e=>setProdForm(f=>({...f,stock:e.target.value}))}/>
            </div>
            <input required placeholder="Image URL https://..." value={prodForm.image_url} onChange={e=>setProdForm(f=>({...f,image_url:e.target.value}))}/>
            <textarea placeholder="Description" value={prodForm.description} onChange={e=>setProdForm(f=>({...f,description:e.target.value}))} style={{minHeight:80, border:'2px solid var(--ink)', padding:12, fontFamily:'Syne'}}/>
            <div style={{display:'flex', gap:8}}>
              <button className="btn-black full" type="submit">{editingId? 'SAVE CHANGES' : 'CREATE PRODUCT'}</button>
              {editingId && <button type="button" className="btn-ghost" onClick={()=>{setEditingId(null); setProdForm({name:'',category:'Tech',price:'',stock:'',description:'',image_url:''})}}>CANCEL</button>}
            </div>
          </form>
          <div style={{display:'flex', flexDirection:'column', gap:8, maxHeight:'35vh', overflow:'auto', marginTop:12}}>
            {products.map(p=><div key={p.id} className="admin-row">
              <div style={{display:'flex', gap:10, alignItems:'center'}}>
                <img src={p.image_url} style={{width:48, height:48, objectFit:'cover', border:'1px solid var(--ink)'}}/>
                <div><b>{p.name}</b><small>{p.category} • {fmt(p.price)} • Stock {p.stock}</small></div>
              </div>
              <div style={{display:'flex', gap:6}}>
                <button className="btn-ghost" style={{height:32}} onClick={()=>startEdit(p)}>EDIT</button>
                <button className="btn-black" style={{height:32, background:'#ff3b30'}} onClick={()=>deleteProduct(p.id)}>DEL</button>
              </div>
            </div>)}
          </div>
        </div>
      )}
    </section>
  </div>}
</div>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);